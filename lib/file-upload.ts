const UPLOAD_FILE_NAME_HEADER = "x-upload-file-name";
const UPLOAD_FILE_SIZE_HEADER = "x-upload-file-size";
const UPLOAD_CLIENT_TASK_ID_HEADER = "x-client-task-id";

function validateFileSize(size: number, maxFileSize: number, sizeError: string) {
  if (!size) {
    throw new Error("The uploaded file was empty.");
  }

  if (size > maxFileSize) {
    throw new Error(sizeError);
  }
}

function decodeUploadFileName(fileName: string) {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

export function buildBinaryUploadHeaders(file: File, clientTaskId?: string) {
  return {
    "Content-Type": file.type || "application/octet-stream",
    [UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(file.name),
    [UPLOAD_FILE_SIZE_HEADER]: String(file.size),
    ...(clientTaskId ? { [UPLOAD_CLIENT_TASK_ID_HEADER]: clientTaskId } : {}),
  };
}

export function readUploadClientTaskId(request: Request) {
  const value = request.headers.get(UPLOAD_CLIENT_TASK_ID_HEADER)?.trim() ?? "";
  return /^optimistic-[a-zA-Z0-9._-]+$/.test(value) ? value : "";
}

export async function readUploadedFileFromRequest(
  request: Request,
  {
    maxFileSize,
    sizeError,
    missingFileError,
    multipleFilesError = "Please upload only one file at a time.",
  }: {
    maxFileSize: number;
    sizeError: string;
    missingFileError: string;
    multipleFilesError?: string;
  },
) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.startsWith("multipart/form-data")) {
    const formData = await request.formData();
    const files = formData.getAll("file");

    if (files.length > 1) {
      throw new Error(multipleFilesError);
    }

    const [file] = files;

    if (!(file instanceof File)) {
      throw new Error(missingFileError);
    }

    validateFileSize(file.size, maxFileSize, sizeError);
    return file;
  }

  const encodedFileName = request.headers.get(UPLOAD_FILE_NAME_HEADER)?.trim();

  if (!encodedFileName) {
    throw new Error(missingFileError);
  }

  const declaredSize = Number.parseInt(
    request.headers.get(UPLOAD_FILE_SIZE_HEADER) ?? "",
    10,
  );

  if (Number.isFinite(declaredSize)) {
    validateFileSize(declaredSize, maxFileSize, sizeError);
  }

  const fileName = decodeUploadFileName(encodedFileName);
  const arrayBuffer = await request.arrayBuffer();
  const fileSize = arrayBuffer.byteLength;

  validateFileSize(fileSize, maxFileSize, sizeError);

  return new File([arrayBuffer], fileName, {
    type: request.headers.get("content-type") ?? "application/octet-stream",
  });
}
