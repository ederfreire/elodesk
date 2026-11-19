import openSocket from "socket.io-client";
import { isObject } from "lodash";
import SocketWorker from "./SocketWorker"

export function socketConnection(params) {
  let userId = "";
  let companyId = "";

  if (isObject(params?.user)) {
    companyId = params.user.companyId || "";
    userId = params.user.id || "";
  } else if (isObject(params)) {
    companyId = params.companyId || params?.company?.id || "";
    userId = params.userId || params.id || "";
  }
 
  return SocketWorker(companyId, userId)
}
