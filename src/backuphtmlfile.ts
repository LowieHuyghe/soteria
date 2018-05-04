import BackupFile from './backupfile'
import * as mkdirp from 'mkdirp'
import * as fs from 'fs'
import GoogleDriveService from './googledriveservice'

export default class BackupHtmlFile extends BackupFile {
  async save (service: GoogleDriveService, progressCallback: (progress: number, done: boolean) => void): Promise<void> {
    // Make directory structure
    if (!fs.existsSync(this.outputDirPath)) {
      mkdirp.sync(this.outputDirPath)
    }

    // Make up content
    const content = `<!DOCTYPE HTML>
<html lang="en-US">
    <head>
        <title>${this.driveFileName}</title>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="0; url=${this.driveFileLink}">
        <script type="text/javascript">
            window.location.href = "${this.driveFileLink}"
        </script>
    </head>
    <body>
        <!-- modifiedTime: ${this.driveFileModifiedTime} -->
        If you are not redirected automatically, follow this <a href='${this.driveFileLink}'>link to ${this.driveFileName}</a>.
    </body>
</html>`

    // Write it
    progressCallback(0, false)
    fs.writeFileSync(this.outputFilePath, content)
    progressCallback(1, true)
  }
}
