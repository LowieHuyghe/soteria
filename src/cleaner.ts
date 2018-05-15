import * as path from 'path'
import * as fs from 'fs'

export default class Cleaner {
  private usedFilePaths: string[]
  private usedDirPaths: string[]

  private onSectionSyncStartedListener: () => void
  private onSectionSyncFinishedListener: (totalFiles: number) => void
  private onSectionDeleteStartedListener: (totalFiles: number) => void
  private onSectionDeleteFinishedListener: (processedFiles: number, totalFiles: number) => void
  private onSyncFileFoundToDeleteListener: (path: string, totalFiles: number) => void
  private onDeleteProgressListener: (path: string, processedFiles: number, totalFiles: number) => void

  constructor (usedFilePaths: string[], usedDirPaths: string[]) {
    this.usedFilePaths = usedFilePaths.map(usedPath => path.resolve(usedPath))
    this.sort(this.usedFilePaths)
    this.usedDirPaths = usedDirPaths.map(usedPath => path.resolve(usedPath))
    this.sort(this.usedDirPaths)
  }

  onSectionSyncStarted (callback: () => void): Cleaner {
    this.onSectionSyncStartedListener = callback
    return this
  }

  onSectionSyncFinished (callback: (totalFiles: number) => void): Cleaner {
    this.onSectionSyncFinishedListener = callback
    return this
  }

  onSectionDeleteStarted (callback: (totalFiles: number) => void): Cleaner {
    this.onSectionDeleteStartedListener = callback
    return this
  }

  onSectionDeleteFinished (callback: (processedFiles: number, totalFiles: number) => void): Cleaner {
    this.onSectionDeleteFinishedListener = callback
    return this
  }

  onSyncFileFoundToDelete (callback: (path: string, totalFiles: number) => void): Cleaner {
    this.onSyncFileFoundToDeleteListener = callback
    return this
  }

  onDeleteProgress (callback: (path: string, processedFiles: number, totalFiles: number) => void): Cleaner {
    this.onDeleteProgressListener = callback
    return this
  }

  async cleanup (outputDir: string) {
    const nonExisting: string[] = await this.sync(outputDir)

    if (nonExisting.length) {
      await this.delete(nonExisting)
    }
  }

  protected async sync (outputDir: string): Promise<string[]> {
    this.onSectionSyncStartedListener && this.onSectionSyncStartedListener()

    const remainingFilePaths = this.usedFilePaths.slice()
    const remainingDirPaths = this.usedDirPaths.slice()
    const nonExisting: string[] = []

    for await (const file of this.walk(outputDir)) {
      while (remainingDirPaths.length && !this.inDir(remainingDirPaths[0], file) && this.compare(file, remainingDirPaths[0]) > 0) {
        remainingDirPaths.shift()
      }

      if (remainingDirPaths.length && this.inDir(remainingDirPaths[0], file)) {
        // Path is inside directory, so do nothing
      } else if (!remainingFilePaths.length || this.compare(file, remainingFilePaths[0]) < 0) {
        // Path comes before next remaining path, so remove it
        nonExisting.push(file)
        this.onSyncFileFoundToDeleteListener && this.onSyncFileFoundToDeleteListener(file, nonExisting.length)
      } else {
        while (remainingFilePaths.length && this.compare(file, remainingFilePaths[0]) >= 0) {
          remainingFilePaths.shift()
        }
      }
    }

    this.onSectionSyncFinishedListener && this.onSectionSyncFinishedListener(nonExisting.length)

    return nonExisting
  }

  protected async delete (nonExisting: string[]) {
    this.onSectionDeleteStartedListener && this.onSectionDeleteStartedListener(nonExisting.length)

    let processedFiles = 0

    for (const filePath of nonExisting) {
      ++processedFiles

      await this.promisify<void>(fs.unlink, filePath)

      let parent = path.dirname(filePath)
      while (parent && parent !== path.sep) {
        const parentFiles = await this.promisify<string[]>(fs.readdir, parent)
        if (parentFiles.length) {
          break
        }

        await this.promisify<void>(fs.rmdir, parent)

        parent = path.dirname(parent)
      }
      this.onDeleteProgressListener && this.onDeleteProgressListener(filePath, processedFiles, nonExisting.length)
    }

    this.onSectionDeleteFinishedListener && this.onSectionDeleteFinishedListener(processedFiles, nonExisting.length)
  }

  protected sort (list: string[]) {
    list.sort(this.compare)
  }

  protected compare (a: string, b: string) {
    const aParts = a.split(path.sep)
    const bParts = b.split(path.sep)

    while (aParts.length && bParts.length && aParts[0] === bParts[0]) {
      aParts.shift()
      bParts.shift()
    }

    // Inside directory
    if (!aParts.length) {
      if (!bParts.length) {
        return 0
      }
      return -1
    } else if (!bParts.length) {
      return 1
    }

    // Directory vs file
    if (aParts.length > 1) {
      if (bParts.length <= 1) {
        return -1
      }
    } else if (bParts.length > 1) {
      return 1
    }

    if (aParts[0] < bParts[0]) {
      return -1
    }
    if (aParts[0] > bParts[0]) {
      return 1
    }
    return 0
  }

  protected inDir (dir: string, file: string) {
    return file.startsWith(dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`)
  }

  protected async * walk (dir: string): any {
    const rawPaths = await this.promisify<string[]>(fs.readdir, dir)
    const paths = rawPaths.map(filePath => path.join(dir, filePath))

    const dirPaths: string[] = []
    const filePaths: string[] = []
    for (const filePath of paths) {
      const filePathStats = await this.promisify<fs.Stats>(fs.stat, filePath)
      if (filePathStats.isDirectory()) {
        dirPaths.push(filePath)
      } else {
        filePaths.push(filePath)
      }
    }
    this.sort(dirPaths)
    this.sort(filePaths)

    for (const filePath of dirPaths) {
      for await (const subFilePath of this.walk(filePath)) {
        yield subFilePath
      }
    }
    for (const filePath of filePaths) {
      yield path.resolve(filePath)
    }
  }

  protected promisify<T> (callback: any, ...args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        callback(...args, (err: Error, result: any) => {
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        })
      } catch (err) {
        reject(err)
      }
    })
  }
}
