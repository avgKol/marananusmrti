/**
 * REST helpers for interacting with Google Drive API via access token.
 */

export async function exportToGoogleDrive(
  accessToken: string,
  fileName: string,
  data: any
): Promise<any> {
  const metadata = {
    name: fileName,
    mimeType: "application/json",
  };

  const boundary = "314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(data, null, 2) +
    closeDelimiter;

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive export failed: ${errText}`);
  }

  return response.json();
}

export async function listDriveJsonFiles(accessToken: string): Promise<any[]> {
  const queryParam = encodeURIComponent("mimeType = 'application/json' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${queryParam}&fields=files(id,name,mimeType,createdTime)&orderBy=modifiedTime%20desc`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive index listing failed: ${errText}`);
  }

  const result = await response.json();
  return result.files || [];
}

export async function downloadDriveJsonFile(
  accessToken: string,
  fileId: string
): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive download failed: ${errText}`);
  }

  return response.json();
}
