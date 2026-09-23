type IFolderName = 'image' | 'media' | 'doc';
type UploadedFiles = Partial<Record<IFolderName, Express.Multer.File[]>>;

export const getSingleFilePath = (
  files: UploadedFiles | undefined,
  folderName: IFolderName,
): string | undefined => {
  const fileField = files?.[folderName];
  if (fileField && Array.isArray(fileField) && fileField.length > 0) {
    return `/${folderName}/${fileField[0].filename}`;
  }

  return undefined;
};

export const getMultipleFilesPath = (
  files: UploadedFiles | undefined,
  folderName: IFolderName,
): string[] | undefined => {
  const folderFiles = files?.[folderName];
  if (folderFiles && Array.isArray(folderFiles)) {
    return folderFiles.map(file => `/${folderName}/${file.filename}`);
  }

  return undefined;
};
