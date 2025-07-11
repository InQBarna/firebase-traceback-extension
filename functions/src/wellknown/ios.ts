import { Request, Response } from 'express';

export interface AppleAppSiteAssociationAppDetails {
  appID: string;
  paths: string[];
};
export interface AppleAppSiteAssociationAppLinks {
  apps: any[];
  details: AppleAppSiteAssociationAppDetails[];
};
export interface AppleAppSiteAssociationWebCredentials {
  apps: string[];
}
export interface AppleAppSizeAssociationDTO {
  applinks: AppleAppSiteAssociationAppLinks[];
  webcredentials: AppleAppSiteAssociationWebCredentials[];
}

export const apple_app_size_association = async function (
  req: Request,
  res: Response,
  iosTeamID: string,
  iosBundleID: string,
) {
  const applicationID = `${iosTeamID}.${iosBundleID}`;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write(
    JSON.stringify({
      applinks: {
        apps: [],
        details: [
          {
            appID: applicationID,
            paths: ['*'],
          },
        ],
      },
      webcredentials: {
        apps: [applicationID],
      },
    }),
  );
  res.end();
};
