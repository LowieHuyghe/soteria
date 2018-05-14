import GoogleBackupFile from './googlebackupfile'
import * as fs from 'fs'
import GoogleDriveService from './googledriveservice'
import * as md5File from 'md5-file'
import * as simpleGit from 'simple-git/promise'
import * as path from 'path'

export default class GoogleBackupGitRepoFile extends GoogleBackupFile {
  async save (service: GoogleDriveService, progressCallback: (progress: number, done: boolean) => void): Promise<void> {
    progressCallback(0, false)

    if (!fs.existsSync(this.outputFilePath)
        || md5File.sync(this.outputFilePath) !== this.driveFileMd5) {
      await super.save(service, (progress) => progressCallback(progress / 2, false))
    }

    progressCallback(0.5, false)

    const outputFilePathContent = fs.readFileSync(this.outputFilePath, 'utf8')
    const remoteUrl = JSON.parse(outputFilePathContent).url

    if (!fs.existsSync(this.repoDirPath)) {
      await simpleGit(this.outputDirPath).silent(true).clone(remoteUrl, this.repoDirName)
    } else {
      const gitInstance = simpleGit(this.repoDirPath).silent(true)
      const isRepo = await gitInstance.checkIsRepo()
      if (!isRepo) {
        throw new Error(`"${this.repoDirPath}" does not seem to be a repo`)
      }

      const remotes = await gitInstance.getRemotes(true)
      if (remotes.length > 1) {
        throw new Error(`"${this.repoDirPath}"-repo has got more than one remote`)
      }
      if (remotes[0].name !== 'origin') {
        throw new Error(`"${this.repoDirPath}"-repo does not have a remote called "origin"`)
      }
      if (!remotes[0].refs || !remotes[0].refs.fetch) {
        throw new Error(`"${this.repoDirPath}"-repo does not have a fetch-ref for remote-"origin"`)
      }
      if (remotes[0].refs.fetch !== remoteUrl) {
        await gitInstance.removeRemote('origin')
        await gitInstance.addRemote('origin', remoteUrl)
      }

      await gitInstance.pull()
    }

    progressCallback(1, true)
  }

  get repoDirName (): string {
    return this.driveFileName.substr(0, this.driveFileName.length - '.git.json'.length)
  }

  get repoDirPath (): string {
    return path.join(this.outputDirPath, this.repoDirName)
  }
}
