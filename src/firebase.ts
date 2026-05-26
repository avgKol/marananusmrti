import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  Auth 
} from "firebase/auth";
import { 
  getFirestore, 
  initializeFirestore,
  persistentLocalCache,
  doc, 
  getDocFromServer, 
  collection, 
  getDocs, 
  setDoc, 
  query, 
  where,
  deleteDoc,
  Firestore
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
const config = firebaseConfig as any;

// Log configuration fields being used at startup (omitting secret keys completely for safety or only showing short prefix)
console.log("[The Marana-Lab] Initializing Firebase with config fields:", {
  projectId: config.projectId,
  authDomain: config.authDomain,
  firestoreDatabaseId: config.firestoreDatabaseId,
  appId: config.appId,
  apiKeyPrefix: config.apiKey ? config.apiKey.substring(0, 8) + "..." : "undefined",
});

let app: any;
export let db: Firestore;
export let auth: Auth;
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive");

export type ConnectionStatus = "connecting" | "connected" | "offline-fallback" | "failed";

export interface FirebaseState {
  status: ConnectionStatus;
  errorMsg: string | null;
  retryCount: number;
}

// Global cached access token in-memory for Drive API import/export
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Custom enum and error helper as required by the Firebase Integration Skill
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
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("[The Marana-Lab] Dedicated Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initialize with a connection test and retry mechanism
export async function initializeFirebaseWithRetries(
  onStateChange: (state: FirebaseState) => void,
  maxRetries = 3
): Promise<{ db: Firestore; auth: Auth } | null> {
  try {
    if (!app) {
      app = initializeApp(config);
      auth = getAuth(app);
      
      const dbId = config.firestoreDatabaseId || "(default)";
      // Configure Firestore with persistent offline local cache to handle network drops cleanly
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({}),
      }, dbId);
    }

    // Handshake verification logic run asynchronously in background so as not to stall application startup
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
          console.log(`[The Marana-Lab] Connection attempt ${attempt}/${maxRetries}...`);
          await getDocFromServer(doc(db, "test", "connection"));
          
          console.log("[The Marana-Lab] Firebase connection verified successfully.");
          onStateChange({
            status: "connected",
            errorMsg: null,
            retryCount: attempt,
          });
          return;
        } catch (error: any) {
          const isPermissionDenied = 
            error?.code === "permission-denied" || 
            (error?.message && (
              error.message.toLowerCase().includes("permission") ||
              error.message.toLowerCase().includes("insufficient")
            ));

          if (isPermissionDenied) {
            console.log("[The Marana-Lab] Connection test returned authorization block or permission-denied. Handshake successful, server is live.");
            onStateChange({
              status: "connected",
              errorMsg: null,
              retryCount: attempt,
            });
            return;
          }

          // Mandated skill console message when offline
          if (error instanceof Error && error.message.includes("client is offline")) {
            console.error("Please check your Firebase configuration.");
          }
          console.error("[The Marana-Lab] Connection check error detail:", error?.message || error);

          if (attempt >= maxRetries) {
            const isOffline = error.message && (
              error.message.includes("client is offline") || 
              error.message.includes("Failed to get document from server") ||
              error.message.includes("network")
            );

            onStateChange({
              status: "offline-fallback",
              errorMsg: isOffline 
                ? "Firebase client is offline. Running in read-only / in-memory local state fallback mode. Please check your Firebase configuration."
                : `Firebase failed to load: ${error.message}. Running in local state fallback mode. Please check your Firebase configuration.`,
              retryCount: attempt,
            });
            return;
          }

          // Brief delay before retry
          await new Promise((res) => setTimeout(res, 1000 * attempt));
        }
      }
    };

    executeHandshake();

    // Succeeded initializing the SDK instances, always return so auth and basic offline reads can operate
    return { db, auth };
  } catch (err: any) {
    console.error("[The Marana-Lab] Fatal Firebase initialization failed:", err);
    onStateChange({
      status: "failed",
      errorMsg: `Failed to initialize SDK: ${err.message}`,
      retryCount: 1,
    });
    return null;
  }
}

// Authentication Listeners
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) throw new Error("Firebase Auth has not been initialized yet.");
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to retrieve Access Token from Google Sign-In.");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("[The Marana-Lab] Sign-in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  if (!auth) return;
  await auth.signOut();
  cachedAccessToken = null;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getFirestoreDatabaseId = (): string => {
  return config.firestoreDatabaseId || "(default)";
};
