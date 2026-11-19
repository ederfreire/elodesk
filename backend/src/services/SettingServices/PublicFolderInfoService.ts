import path from "path";
import { getFolderSize } from "./CleanPublicFolderService";

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

interface Request {
  companyId: number;
}

interface Response {
  totalBytes: number;
  fileCount: number;
}

/**
 * Retorna o tamanho atual (bytes) e a quantidade de arquivos da pasta
 * public da empresa.
 */
const PublicFolderInfoService = async ({
  companyId
}: Request): Promise<Response> => {
  const companyFolder = path.resolve(publicFolder, `company${companyId}`);
  const { totalBytes, fileCount } = getFolderSize(companyFolder);
  return { totalBytes, fileCount };
};

export default PublicFolderInfoService;
