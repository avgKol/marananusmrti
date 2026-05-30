import { initializeApp } from "firebase/app";
import {
  Firestore,
  doc,
  getDocFromServer,
  initializeFirestore,
  persistentLocalCache,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const config = firebaseConfig as any;

console.log("[Marananusmrti] Initializing Firebase with config fields:", {
  projectId: config.projectId,
  authDomain: config.authDomain,
  firestoreDatabaseId: config.firestoreDatabaseId,
  appId: config.appId,
  apiKeyPrefix: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : "undefined",
});

let app: ReturnType<typeof initializeApp> | undefined;
export let db: Firestore;

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "offline-fallback"
  | "failed";

export interface FirebaseState {
  status: ConnectionStatus;
  errorMsg: string | null;
  retryCount: number;
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  databaseId: string;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    databaseId: getFirestoreDatabaseId(),
  };
  console.error("[Marananusmrti] Firestore error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function initializeFirebaseWithRetries(
  onStateChange: (state: FirebaseState) => void,
  maxRetries = 3
): Promise<{ db: Firestore } | null> {
  try {
    if (!app) {
      app = initializeApp(config);
      const dbId = config.firestoreDatabaseId || "(default)";
      db = initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({}),
        },
        dbId
      );
    }

    let attempt = 0;
    const executeHandshake = async () => {
      while (attempt < maxRetries) {
        attempt++;
        onStateChange({
          status: "connecting",
          errorMsg: null,
          retryCount: attempt,
        });

        try {
          console.log(`[Marananusmrti] Connection attempt ${attempt}/${maxRetries}...`);
          await getDocFromServer(doc(db, "test", "connection"));
          console.log("[Marananusmrti] Firestore connection verified successfully.");
          onStateChange({
            status: "connected",
            errorMsg: null,
            retryCount: attempt,
          });
          return;
        } catch (error: any) {
          console.error("[Marananusmrti] Connection check error detail:", error?.message || error);

          if (attempt >= maxRetries) {
            const isOffline =
              error?.message &&
              (error.message.includes("client is offline") ||
                error.message.includes("Failed to get document from server") ||
                error.message.includes("network"));

            onStateChange({
              status: "offline-fallback",
              errorMsg: isOffline
                ? "Firestore is unavailable. Running from the canonical seed corpus."
                : `Firestore failed to load: ${error.message}. Running from the canonical seed corpus.`,
              retryCount: attempt,
            });
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    };

    void executeHandshake();

    return { db };
  } catch (err: any) {
    console.error("[Marananusmrti] Fatal Firebase initialization failed:", err);
    onStateChange({
      status: "failed",
      errorMsg: `Failed to initialize Firebase: ${err.message}`,
      retryCount: 1,
    });
    return null;
  }
}

export const getFirestoreDatabaseId = (): string => config.firestoreDatabaseId || "(default)";
