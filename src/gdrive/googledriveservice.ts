import { google } from 'googleapis'
import GoogleDriveDir from './googledrivedir'
import GoogleDriveFile from './googledrivefile'
import * as fs from 'fs'
import * as Batchelor from 'batchelor'
import * as http from 'http'
import * as url from 'url'
import * as opn from 'opn'
import * as querystring from 'querystring'
(Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for('Symbol.asyncIterator')

export type WalkItem = {
  parent: GoogleDriveDir | undefined;
  nextPageToken: string | undefined;
  retry: number;
}
export type FetchItemsResult = {
  files: GoogleDriveFile[],
  walkItems: WalkItem[]
}

export default class GoogleDriveService {
  protected static BATCH_SIZE = 100
  protected static SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

  drive: any
  auth: any

  constructor (auth: any) {
    this.auth = auth
    this.drive = google.drive({
      version: 'v3',
      auth
    })
  }

  static async create (clientSecretPath: string, credentialsPath: string) {
    // Make oAuth client
    let oAuth2Client = this.getOAuthClient(clientSecretPath)
    oAuth2Client = await this.authenticateOAuthClient(oAuth2Client, credentialsPath)

    return new GoogleDriveService(oAuth2Client)
  }

  protected static getOAuthClient (clientSecretPath: string): any {
    // Read the client secret
    const clientSecretContents = fs.readFileSync(clientSecretPath).toString()
    const clientSecretJson = JSON.parse(clientSecretContents)
    const {
      client_secret,
      client_id,
      redirect_uris
    } = clientSecretJson.installed

    // Make oAuth client
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
  }

  protected static async authenticateOAuthClient (oAuth2Client: any, credentialsPath: string): Promise<any> {
    // Use the existing credentials to log in
    if (fs.existsSync(credentialsPath)) {
      const existingCredentialsContents = fs.readFileSync(credentialsPath).toString()
      const existingCredentials = JSON.parse(existingCredentialsContents)
      oAuth2Client.setCredentials(existingCredentials)

      // Not expired, so log in
      if (Date.now() < existingCredentials.expiry_date) {
        return oAuth2Client
      }

      // Refresh token
      if (existingCredentials.refresh_token) {
        const refreshResponse = await oAuth2Client.refreshAccessToken()
        if (refreshResponse && refreshResponse.credentials) {
          const refreshedCredentials = {
            ...existingCredentials,
            ...refreshResponse.credentials
          }
          oAuth2Client.setCredentials(refreshedCredentials)

          // Store the credentials to disk for later program executions
          fs.writeFileSync(credentialsPath, JSON.stringify(refreshedCredentials))
          return oAuth2Client
        }
      }
    }

    // Try logging in
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GoogleDriveService.SCOPES
    })

    return new Promise((resolve, reject) => {
      // Open an http server to accept the oauth callback. In this simple example, the
      // only request to our webserver is to /oauth2callback?code=<code>
      const server = http.createServer(async (req, res) => {
        if (req.url.indexOf('/oauth2callback') > -1) {
          // acquire the code from the querystring, and close the web server.
          const qs = querystring.parse(url.parse(req.url).query)
          console.log(`Code is ${qs.code}`)
          res.end('Authentication successful! Please return to the console.')
          server.close()

          // Now that we have the code, use that to acquire tokens.
          const getTokenResponse = await oAuth2Client.getToken(qs.code)
          oAuth2Client.setCredentials(getTokenResponse.tokens)

          // Store the credentials to disk for later program executions
          fs.writeFileSync(credentialsPath, JSON.stringify(getTokenResponse.tokens))

          resolve(oAuth2Client)
        }
      }).listen(3000, () => {
        // open the browser to the authorize url to start the workflow
        opn(authUrl)
      })
    })
  }

  async * walk (givenWalkItems: WalkItem[] = [{ parent: undefined, nextPageToken: undefined, retry: 0 }]): any {
    const remainingWalkItems = givenWalkItems.slice()
    const uniqueNames = {}

    while (remainingWalkItems.length) {
      const batchItems: WalkItem[] = remainingWalkItems.splice(0, GoogleDriveService.BATCH_SIZE)

      const hasRetryItems = batchItems.findIndex(x => x.retry > 0) >= 0
      const result = await this.fetchItems(batchItems, uniqueNames, hasRetryItems ? 1000 : 0)

      for (const file of result.files) {
        yield file
      }

      remainingWalkItems.unshift(...result.walkItems)
    }
  }

  protected fetchItems (batchItems: WalkItem[], uniqueNames: any, delay = 0): Promise<FetchItemsResult> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const batch = new Batchelor({
          uri: 'https://www.googleapis.com/batch',
          method: 'POST',
          auth: {
            bearer: this.auth.credentials.access_token
          },
          headers: {
            'Content-Type': 'multipart/mixed'
          }
        }).add(batchItems.map((batchItem: WalkItem) => {
          const parentId = batchItem.parent ? batchItem.parent.id : 'root'
          const q = `parents = "${parentId}" and trashed = false`
          const fields = 'files(id, name, mimeType, md5Checksum, webViewLink, size, modifiedTime), nextPageToken'
          const orderBy = 'folder, name, modifiedTime'

          let path = '/drive/v3/files'
          path += `?q=${encodeURIComponent(q)}`
          path += `&fields=${encodeURIComponent(fields)}`
          path += `&orderBy=${encodeURIComponent(orderBy)}`
          if (batchItem.nextPageToken) {
            path += `&pageToken=${encodeURIComponent(batchItem.nextPageToken)}`
          }

          return {
            method: 'GET',
            path,
            extend: {
              walkItem: batchItem
            }
          }
        }))

        batch.run((err: Error | undefined, response: any, extendObjects: { walkItem: WalkItem }[]) => {
          batch.reset()

          if (err) {
            reject(err)
            return
          }

          const files: GoogleDriveFile[] = []
          const walkItems: WalkItem[] = []

          for (const result of response.parts) {
            const parentWalkItem = extendObjects[result.headers['Content-ID']].walkItem

            if (result.body && result.body.error) {
              switch (result.body.error.code) {
                case 403:
                case 429:
                case 500:
                case 503:
                  walkItems.push({
                    parent: parentWalkItem.parent,
                    nextPageToken: parentWalkItem.nextPageToken,
                    retry: parentWalkItem.retry + 1
                  })
                  continue
                default:
                  reject(new Error(`${result.body.error.code} ${result.body.error.message}`))
                  return
              }
            }

            if (result.body.nextPageToken) {
              walkItems.push({
                parent: parentWalkItem.parent,
                nextPageToken: result.body.nextPageToken,
                retry: 0
              })
            }

            if (result.body.files) {
              for (const driveItem of result.body.files) {
                if (GoogleDriveDir.isDir(driveItem)) {
                  const driveDir = new GoogleDriveDir(parentWalkItem.parent, driveItem)
                  if (!(driveDir.path in uniqueNames)) {
                    uniqueNames[driveDir.path] = 0
                  } else {
                    ++uniqueNames[driveDir.path]
                  }
                  driveDir.uniqueNameIndex = uniqueNames[driveDir.path]

                  walkItems.push({
                    parent: driveDir,
                    nextPageToken: undefined,
                    retry: 0
                  })
                } else {
                  const driveFile = new GoogleDriveFile(parentWalkItem.parent, driveItem)
                  if (!(driveFile.path in uniqueNames)) {
                    uniqueNames[driveFile.path] = 0
                  } else {
                    ++uniqueNames[driveFile.path]
                  }
                  driveFile.uniqueNameIndex = uniqueNames[driveFile.path]

                  files.push(driveFile)
                }
              }
            }
          }

          resolve({
            files,
            walkItems
          })
        })
      }, delay)
    })
  }
}
