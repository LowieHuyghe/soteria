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
}
export type FetchItemsResult = {
  files: GoogleDriveFile[],
  walkItems: WalkItem[]
}

export default class GoogleDriveService {
  protected static BATCH_SIZE = 10
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

  async * walk (givenWalkItems: WalkItem[] = [{ parent: undefined, nextPageToken: undefined }]): any {
    let remainingWalkItems = givenWalkItems
    const uniqueNames = {}

    while (remainingWalkItems.length) {
      const batchItems = remainingWalkItems.slice(0, GoogleDriveService.BATCH_SIZE)
      remainingWalkItems = remainingWalkItems.slice(GoogleDriveService.BATCH_SIZE)

      const result = await this.fetchItems(batchItems, uniqueNames)

      for (const file of result.files) {
        yield file
      }
      remainingWalkItems.push(...result.walkItems)
    }
  }

  protected fetchItems (batchItems: WalkItem[], uniqueNames: any): Promise<FetchItemsResult> {
    return new Promise((resolve, reject) => {
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
        const fields = 'files(id, name, mimeType, md5Checksum, webViewLink, size), nextPageToken'
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
            parent: batchItem.parent,
            nextPageToken: batchItem.nextPageToken
          }
        }
      }))

      batch.run((err: Error | undefined, response: any, extendObjects: { parent: GoogleDriveDir | undefined, nextPageToken: string | undefined }[]) => {
        batch.reset()

        if (err) {
          reject(err)
          return
        }
        if (response.body && response.body.error) {
          reject(new Error(`${response.body.error.code} ${response.body.error.message}`))
          return
        }

        const files: GoogleDriveFile[] = []
        const walkItems: WalkItem[] = []

        for (const result of response.parts) {
          const extendObject = extendObjects[result.headers['Content-ID']]
          const parent = extendObject ? extendObject.parent : undefined
          const parentNextPageToken = extendObject ? extendObject.nextPageToken : undefined

          if (result.body.nextPageToken) {
            walkItems.push({
              parent: parent,
              nextPageToken: result.body.nextPageToken
            })
          }

          if (result.body.files) {
            for (const driveItem of result.body.files) {
              if (GoogleDriveDir.isDir(driveItem)) {
                const driveDir = new GoogleDriveDir(this.drive, parent, driveItem)
                if (!(driveDir.path in uniqueNames)) {
                  uniqueNames[driveDir.path] = 0
                } else {
                  ++uniqueNames[driveDir.path]
                }
                driveDir.uniqueNameIndex = uniqueNames[driveDir.path]

                walkItems.push({
                  parent: driveDir,
                  nextPageToken: undefined
                })
              } else {
                const driveFile = new GoogleDriveFile(this.drive, parent, driveItem)
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
    })
  }
}
