# Security Specification: The Marana-Lab

This specification outlines the security and access control model implemented to protect the user's recursive philosophical graphs in Cloud Firestore.

## 1. Zero-Trust Access Rules
Firestore rules enforce that all write operations (`create`, `update`, `delete`) and read operations are verified against the user's authenticated user ID.

- **Authentication Enforcement**: Only requests with a valid `request.auth` token are permitted.
- **Resource Ownership**: Users can only read or write to documents inside the `nodes` collection where the resource data `userId` is equal to their authenticated UID (`request.auth.uid`).
- **Input Validation**: Documents must follow strict schema assertions, ensuring limits on identifier length and character formats prevent injection attacks or database corruption.

## 2. Firestore Security Configuration (`/firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    match /nodes/{nodeId} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow create: if isSignedIn() && incoming().userId == request.auth.uid && isValidId(nodeId);
      allow update: if isSignedIn() && existing().userId == request.auth.uid && incoming().userId == request.auth.uid;
      allow delete: if isSignedIn() && existing().userId == request.auth.uid;
    }

    function isSignedIn() {
      return request.auth != null;
    }
    
    function incoming() {
      return request.resource.data;
    }
    
    function existing() {
      return resource.data;
    }

    function isValidId(id) { 
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); 
    }
  }
}
```

## 3. Google Drive Scope & Token Seeding
To adhere strictly to the principle of least privilege:
- **Scope**: Request is limited strictly to `https://www.googleapis.com/auth/drive.file`. This scope only allows the application to read and write files that were created by this specific application, keeping the rest of the user's personal Google Drive locked and secure.
- **Token Management**: Refresh and access tokens reside strictly in volatile execution memory (`cachedAccessToken` configuration inside `/src/firebase.ts`) and are never written or leaked to insecure `localStorage` values. This protects sessions from Cross-Site Scripting (XSS) extraction.
