import { putPresignedFile } from './presigned-upload';

describe('putPresignedFile', () => {
  it('PUTs the file to the signed storage URL with the signed content type', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const file = new Blob(['binary']);

    await putPresignedFile({
      uploadUrl: 'https://storage.example.test/signed',
      file,
      contentType: 'image/png',
      fetch: transport,
    });

    expect(transport).toHaveBeenCalledWith(
      'https://storage.example.test/signed',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: file,
      }),
    );
  });

  it('rejects storage errors and non-2xx responses', async () => {
    await expect(
      putPresignedFile({
        uploadUrl: 'https://storage.example.test/signed',
        file: new Blob(['binary']),
        contentType: 'image/png',
        fetch: vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
      }),
    ).rejects.toThrow('Storage từ chối upload file (403).');

    await expect(
      putPresignedFile({
        uploadUrl: 'https://storage.example.test/signed',
        file: new Blob(['binary']),
        contentType: 'image/png',
        fetch: vi.fn().mockRejectedValue(new Error('offline')),
      }),
    ).rejects.toThrow('Không kết nối được storage để upload file.');
  });
});
