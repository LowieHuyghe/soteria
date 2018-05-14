import * as path from 'path'
import * as fs from 'fs'

export default class Cleaner {
  private usedPaths: string[]

  constructor (usedPaths: string[]) {
    this.usedPaths = usedPaths.map(usedPath => path.resolve(usedPath))
    this.sort(this.usedPaths)
  }

  async cleanup (outputDir: string) {
    const remainingPaths = this.usedPaths.slice()
    const nonExisting: string[] = []

    const iterator = this.walk(outputDir)

    let res = iterator.next()
    while (!res.done) {
      const file = res.value

      if (file === remainingPaths[0]) {
        // Paths are equal
        remainingPaths.shift()
      } else if (file.startsWith(`${remainingPaths[0]}${path.sep}`)) {
        // Path is inside directory, so do nothing
      } else if (file < remainingPaths[0]) {
        // Path comes before next remaining path, so remove it
        nonExisting.push(file)
      } else {
        // Path is greater than next remaining path
        do {
          remainingPaths.shift()
        } while (file > remainingPaths[0] && !file.startsWith(`${remainingPaths[0]}${path.sep}`))
      }

      res = iterator.next()
    }

    console.log(nonExisting, this.usedPaths.length)
  }

  protected * walk (dir: string): any {
    const paths: string[] = fs.readdirSync(dir).map(filePath => path.join(dir, filePath))
    const dirPaths: string[] = paths.filter(filePath => fs.statSync(filePath).isDirectory())
    this.sort(paths, dirPaths)

    for (const filePath of paths) {
      if (dirPaths.includes(filePath)) {
        yield * this.walk(filePath)
      } else {
        yield path.resolve(filePath)
      }
    }
  }

  protected sort (paths: string[], dirPaths: string[] = undefined) {
    if (!dirPaths) {
      dirPaths = paths.filter(filePath => fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())
    }

    paths.sort((a, b) => {
      const aPath = dirPaths.includes(a) ? `${a}${path.sep}` : a
      const bPath = dirPaths.includes(b) ? `${b}${path.sep}` : b

      if (aPath > bPath) {
        return 1
      }
      if (aPath < bPath) {
        return -1
      }
      return 0
    })
  }
}
