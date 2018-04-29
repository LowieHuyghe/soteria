import * as commander from 'commander'
import GoogleDriveService from './googledriveservice'
import GoogleDriveFile from './googledrivefile'

export default class Program {
  /**
   * Command
   */
  private command: commander.Command

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
    let files = 0
    for await (const file of service.walk()) {
      ++files
      // files.push(file)
      console.log(files, 'Found file!', file.path)
    }
  }
}
