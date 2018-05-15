
export default class Downloader {
  private simultaneous: number
  private nextDownload: (workerIndex: number) => Promise<boolean>

  constructor (nextDownload: (workerIndex: number) => Promise<boolean>, simultaneous: number) {
    this.nextDownload = nextDownload
    this.simultaneous = simultaneous
  }

  async start (): Promise<void> {
    const workers: Promise<void>[] = []

    for (let i = 0; i < this.simultaneous; ++i) {
      workers.push(this.getWorker(i))
    }

    await Promise.all(workers)
  }

  protected async getWorker (workerIndex: number): Promise<void> {
    let shouldContinue = true
    while (shouldContinue) {
      const download: Promise<boolean> = this.nextDownload(workerIndex)
      if (download) {
        shouldContinue = await download
      } else {
        shouldContinue = false
      }
    }
  }
}
