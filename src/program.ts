import * as commander from 'commander'
import GoogleDriveService from './googledriveservice'
import GoogleDriveFile from './googledrivefile'
import * as fs from 'fs'
import * as readline from 'readline'
import * as lineReader from 'line-reader'

export default class Program {
  /**
   * Command
   */
  private command: commander.Command

  private syncCache: string = 'sync.cache.json'

  /**
   * Constructor
   * @param {commander.Command} command
   */
  constructor (command: commander.Command) {
    this.command = command
      .name('Google Drive Backup Tool')
      .version('0.1.0')
      .usage('[options] <output_dir>')
      .option('-f, --force', 'Do not ask for confirmation')
      .option('-c, --cached', 'Use cached sync')
      .option('-d, --delete', 'Delete local files and directories that do not exist on drive anymore')
      .action(this.action.bind(this))
  }

  /**
   * Run the program
   * @param {string[]} argv
   */
  run (argv: string[]): void {
    this.command.parse(argv)
  }

  /**
   * Action
   * @param {string} outputDir
   */
  protected async action (outputDir: string) {
    const service: GoogleDriveService = await GoogleDriveService.create('googleapi.clientsecret.json', 'googleapi.credentials.json')

    if (!this.command.cached || !fs.existsSync(this.syncCache)) {
      await this.sync(service)
    }
    await this.download(service, outputDir)
  }

  /**
   * Sync your google drive
   * @param {GoogleDriveService} service
   * @returns {Promise<void>}
   */
  protected async sync (service: GoogleDriveService) {
    let files: number = 0

    let cacheFile: fs.WriteStream
    try {
      cacheFile = fs.createWriteStream(this.syncCache, { encoding: 'utf8' })

      for await (const file of service.walk()) {
        console.log(files, 'Found file!', file.path)
        cacheFile.write(`${file.toJson()}\n`)
        ++files
      }
    } finally {
      if (cacheFile) {
        cacheFile.close()
      }
    }
  }

  /**
   * Download your google drive
   * @param {GoogleDriveService} service
   * @param {string} outputDir
   * @returns {Promise<void>}
   */
  protected async download (service: GoogleDriveService, outputDir: string) {
    return new Promise((resolve, reject) => {
      let files: number = 0
      try {
        lineReader.eachLine(this.syncCache, async (line: string, last: boolean, cb: (done?: boolean) => void) => {
          ++files

          const driveFile: GoogleDriveFile = GoogleDriveFile.fromJson(line)

          if (!driveFile.getNeedsToBackup(outputDir)) {
            process.stdout.write(`${files} - Skipped ${driveFile.path}\n`)
          } else {
            const filesToBackup = driveFile.getFilesToBackup(outputDir)
            for (const fileToBackup of filesToBackup) {
              await fileToBackup.save(service, (progress: number, done: boolean) => {
                readline.clearLine(process.stdout, 0)
                readline.cursorTo(process.stdout, 0)

                const formattedProgress = Math.round(progress * 100 * 100) / 100
                process.stdout.write(`${files} - Downloading "${fileToBackup.driveFilePath}" - ${formattedProgress}%`)
                if (done) {
                  process.stdout.write('\n')
                }
              })
            }
          }

          cb()
        })
      } catch (err) {
        reject(err)
      }
    })
  }
}
