# Google Drive Backup Tool

Tool to fully backup your Google Drive to an external location once
in a while!

Supports backing up Google Doc-files!  
 *Google Doc-files on your local disk are only links. So adding them to
 a local directory doesn't accomplish anything. Instead the tool makes
 actual backups of the content and adds them to the directory:*
  - .gdoc → .pdf, .docx, .odt, .zip & .txt
  - .gsheet → .pdf, .xslx, .ods, .zip & .csv
  - .gslides → .pdf, .pptx, .odp & .txt
  - .gdraw → .pdf, .png, .jpg & .svg
  - .gscript → .json


## Installation

1. Clone the project:

 ```bash
git clone git@github.com:LowieHuyghe/google-drive-backup-tool.git
```
2. Move into the new directory:

 ```bash
cd google-drive-backup-tool
```
3. Install the dependencies:

 ```bash
npm install
```
4. Add credentials to backup Google Doc-files:
  * Go to [Google API Dashboard](https://console.developers.google.com/apis/dashboard)
  * Enabled the *Google Drive API*
  * Go to *Credentials* and create *OAuth client ID Credentials*
  * Select *Other* and give the client a name
  * Once you close the dialog, click the download icon
  * Move the downloaded file to the root of this project
  * Rename it to *googleapi.clientsecret.json*


## Run

 ```bash
npm start
```
