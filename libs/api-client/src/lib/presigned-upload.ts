/**
 * PUT a browser-selected file to a storage URL signed by core-api.
 * This is deliberately separate from the REST client: the request target is the
 * storage provider, not core-api, and must not carry the user's API credentials.
 */
export async function putPresignedFile(input: {
  uploadUrl: string;
  file: Blob;
  contentType: string;
  fetch?: typeof globalThis.fetch;
}): Promise<void> {
  const transport = input.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await transport(input.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      body: input.file,
    });
  } catch (cause) {
    const error = new Error('Không kết nối được storage để upload file.');
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Storage từ chối upload file (${response.status}).`);
  }
}
