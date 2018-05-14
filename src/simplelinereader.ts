import * as LineReader from 'line-reader'
import * as fs from 'fs'

export default class SimpleLineReader {
  private reader: LineReader | undefined

  constructor (reader: LineReader) {
    this.reader = reader
  }

  static open (file: string): Promise<SimpleLineReader> {
    return new Promise(((resolve, reject) => {
      try {
        LineReader.open(file, (err: Error | undefined, reader: LineReader) => {
          if (err) {
            reject(err)
          } else {
            resolve(new SimpleLineReader(reader))
          }
        })
      } catch (err) {
        reject(err)
      }
    }))
  }

  static lineCount (file: string): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        let lineCount = 0
        fs.createReadStream(file)
          .on('data', (buffer) => {
            let idx = -1
            lineCount-- // Because the loop will run once for idx=-1
            do {
              idx = buffer.indexOf(10, idx + 1)
              ++lineCount
            } while (idx !== -1)
          })
          .on('end', () => {
            resolve(lineCount)
          })
          .on('error', reject)
      } catch (err) {
        reject(err)
      }
    })
  }

  async nextLine (): Promise<string | undefined> {
    if (!this.reader) {
      return undefined
    }
    if (!this.reader.hasNextLine()) {
      return this.close().then(() => undefined)
    }

    return new Promise<string>((resolve, reject) => {
      try {
        this.reader.nextLine(async (err: Error, line: string) => {
          if (err) {
            try {
              await this.close()
              reject(err)
            } catch (closeErr) {
              reject(closeErr)
            }
          } else {
            resolve(line)
          }
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  async close (): Promise<void> {
    if (!this.reader) {
      return
    }

    return new Promise<void>((resolve, reject) => {
      try {
        // Line-reader uses the close-function of fs.createReadStream() which completely stops the program
        // So instead we use the destroy-function
        const readStream = (this.reader as any).getReadStream()
        readStream.destroy()

        this.reader = undefined

        resolve()

        // this.reader.close((err) => {
        //   this.reader = undefined
        //   if (err) {
        //     reject(err)
        //   } else {
        //     resolve()
        //   }
        // })
      } catch (err) {
        reject(err)
      }
    })
  }
}
