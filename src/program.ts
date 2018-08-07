import * as commander from 'commander'
import GoogleDriveFile from './gdrive/googledrivefile'
import * as readline from 'readline'
import * as path from 'path'
import GoogleDriveBackup from './gdrive/googledrivebackup'
import GoogleBackupFile from './gdrive/googlebackupfile'
import Cleaner from './cleaner'
import * as opn from 'opn'

class Program {
  /**
   * Command
   */
  private command: commander.Command
  /**
   * Root directory
   */
  private root: string

  /**
   * Constructor
   * @param {commander.Command} command
   * @param {string} root
   */
  constructor (command: commander.Command, root: string) {
    this.command = command
      .name('Google Drive Backup Tool')
      .version('0.1.0')
      .usage('--output <outputDir> [options]')
      .option('-o, --output [outputDir]', 'Output directory')
      .option('-w, --workers [workerCount]', 'Number of workers', 3)
      .option('-c, --cached', 'Use cached sync')
    this.root = root
  }

  /**
   * Run the program
   * @param {string[]} argv
   */
  async run (argv: string[]): Promise<void> {
    this.command.parse(argv)

    if (this.command.output && typeof this.command.output === 'string') {
      await this.action(this.command.output, this.command.workers)
    } else {
      this.command.outputHelp()
      process.exit(1)
    }
  }

  /**
   * Action
   * @param {string} givenOutputDir
   * @param {number} workerCount
   */
  protected async action (givenOutputDir: string, workerCount: number) {
    const outputDir = path.isAbsolute(givenOutputDir)
      ? givenOutputDir  // absolute path
      : path.join(process.cwd(), givenOutputDir)  // relative path
    const clientSecretFile = path.join(this.root, 'googleapi.clientsecret.json')
    const credentialsFile = path.join(this.root, 'googleapi.credentials.json')
    const cacheFile = path.join(this.root, 'gdrive.cache.json')

    const usedFilePaths: string[] = []
    const usedDirPaths: string[] = []

    const backup = await GoogleDriveBackup.create(clientSecretFile, credentialsFile, cacheFile, workerCount, this.authenticate)
    backup
      // SYNC
      .onSectionSyncStarted(() => {
        this.printTitle('SYNCING')
        for (let i = 0; i < 1; ++i) {
          process.stdout.write('\n')
        }
      })
      .onSyncFileFound((file: GoogleDriveFile, totalFiles: number) => {
        this.printOutput(0, 2, true, `Found file "${file.path}"`)
        this.printOutput(1, 2, true, `Total files: ${totalFiles}`)
      })
      .onSectionSyncFinished((totalFiles: number) => {
        this.printOutput(0, 2, true, `Finished`)
        this.printOutput(1, 2, true, `Total files: ${totalFiles}`)
        process.stdout.write('\n')
      })

      // DOWNLOAD
      .onSectionDownloadStarted((totalFiles: number) => {
        this.printTitle('DOWNLOADING')
        for (let i = 0; i < workerCount; ++i) {
          process.stdout.write('\n')
        }
      })
      .onDownloadInitializing((file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number) => {
        this.printOutput(workerIndex, workerCount + 1, true, `Worker ${workerIndex + 1} - Started "${file.path}"`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      })
      .onPathInUse((path: string, isDirectory: boolean) => {
        if (isDirectory) {
          usedDirPaths.push(path)
        } else {
          usedFilePaths.push(path)
        }
      })
      .onDownloadSkip((file: GoogleDriveFile, processedFiles: number, totalFiles: number, workerIndex: number) => {
        this.printOutput(workerIndex, workerCount + 1, true, `Worker ${workerIndex + 1} - Skipped "${file.path}"`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      })
      .onDownloadProgress((file: GoogleDriveFile, fileToBackup: GoogleBackupFile, progress: number, processedFiles: number, totalFiles: number, workerIndex: number) => {
        const formattedProgress = Math.round(progress * 100 * 100) / 100
        this.printOutput(workerIndex, workerCount + 1, true, `Worker ${workerIndex + 1} - Downloading "${fileToBackup.driveFilePath}" - ${formattedProgress}%`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      })
      .onDownloadError((file: GoogleDriveFile, fileToBackup: GoogleBackupFile, error: Error, processedFiles: number, totalFiles: number, workerIndex: number) => {
        this.printOutput(workerIndex, workerCount + 1, false, `Failed to download "${fileToBackup.driveFilePath}" - ${error.message}`)
        this.printOutput(workerCount, workerCount + 1, true, `Processed: ${processedFiles} / ${totalFiles}`)
      })
      .onUnwantedGitRepo((file: GoogleDriveFile) => {
        this.printOutput(0, workerCount + 1, false, `Found unwanted git repo at "${file.path}"`)
      })
      .onSectionDownloadFinished((processedFiles: number, totalFiles: number) => {
        for (let i = 0; i < workerCount; ++i) {
          this.printOutput(i, workerCount + 1, true, `Worker ${i + 1} - Done`)
        }
        this.printOutput(workerCount, workerCount + 1, true, `Processed ${totalFiles} files`)
        process.stdout.write('\n')
      })

    await backup.start(outputDir, this.command.cached)

    const cleaner = new Cleaner(usedFilePaths, usedDirPaths)
    cleaner
      .onSectionSyncStarted(() => {
        this.printTitle('INDEXING FOR CLEANUP')
        for (let i = 0; i < 1; ++i) {
          process.stdout.write('\n')
        }
      })
      .onSyncFileFoundToDelete((path: string, totalFiles: number) => {
        this.printOutput(0, 2, true, `Found file to delete "${path}"`)
        this.printOutput(1, 2, true, `Indexed ${totalFiles} files`)
      })
      .onSectionSyncFinished((totalFiles: number) => {
        this.printOutput(0, 2, true, `Done`)
        this.printOutput(1, 2, true, `Finished indexing ${totalFiles} files`)
        process.stdout.write('\n')
      })
      .onSectionDeleteStarted(() => {
        this.printTitle('CLEANUP')
        for (let i = 0; i < 1; ++i) {
          process.stdout.write('\n')
        }
      })
      .onDeleteProgress((path: string, processedFiles: number, totalFiles: number) => {
        this.printOutput(0, 2, true, `Deleted "${path}"`)
        this.printOutput(1, 2, true, `Deleted: ${processedFiles} / ${totalFiles}`)
      })
      .onSectionDeleteFinished((processedFiles: number, totalFiles: number) => {
        this.printOutput(0, 2, true, 'Done')
        this.printOutput(1, 2, true, `Finished deleting ${totalFiles} files`)
        process.stdout.write('\n')
      })
    await cleaner.cleanup(outputDir)
  }

  protected printTitle (title: string) {
    process.stdout.write('\n')
    process.stdout.write(`${'#'.repeat(2 + (3 * 2) + title.length)}\n`)
    process.stdout.write(`#   ${title}   #\n`)
    process.stdout.write(`${'#'.repeat(2 + (3 * 2) + title.length)}\n`)
    process.stdout.write('\n')
  }

  protected printOutput (lineIndex: number, lineCount: number, overWritable: boolean, text: string) {
    if (overWritable) {
      readline.cursorTo(process.stdout, 0)
      readline.moveCursor(process.stdout, 0, -(lineCount - 1 - lineIndex))
      readline.clearLine(process.stdout, 0)

      process.stdout.write(text)

      readline.moveCursor(process.stdout, 0, lineCount - 1 - lineIndex)
    } else {
      readline.cursorTo(process.stdout, 0)
      readline.moveCursor(process.stdout, 0, -(lineCount - 1))
      readline.clearLine(process.stdout, 0)

      process.stdout.write(text)

      readline.moveCursor(process.stdout, 0, lineCount - 1)
      process.stdout.write('\n')
    }
  }

  protected async authenticate (authUrl: string): Promise<string> {
    process.stdout.write('Opening browser to authenticate Google Drive Service.\n')
    await opn(authUrl, { wait: false })

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    return new Promise<string>((resolve, reject) => {
      rl.question('Please paste the given code here: ', (code) => {
        if (code) {
          resolve(code)
        } else {
          reject(new Error('No valid code given'))
        }
      })
    })
  }
}

new Program(commander, path.join(__dirname, '..'))
  .run(process.argv)
  .catch((err) => {
    console.error(err)
  })
