import { Request, Response } from 'express';

export const asset_links = async function (
  req: Request,
  res: Response,
  androidBundleID: string,
  androidSHA: string,
) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write(
    JSON.stringify([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: androidBundleID,
          sha256_cert_fingerprints: [androidSHA],
        },
      },
    ]),
  );
  res.end();
};
