import moment from "moment-timezone";
import { useContext } from "react";
import { AuthContext } from "../../context/Auth/AuthContext";

export function useDate() {
  const { user } = useContext(AuthContext) || {};
  const userTimezone =
    user?.timezone ||
    localStorage.getItem("userTimezone") ||
    moment.tz.guess() ||
    "America/Sao_Paulo";

  function dateToClient(strDate) {
    if (strDate && moment(strDate).isValid()) {
      return moment.utc(strDate).tz(userTimezone).format("DD/MM/YYYY");
    }
    return "";
  }

  function datetimeToClient(strDate) {
    if (strDate && moment(strDate).isValid()) {
      return moment.utc(strDate).tz(userTimezone).format("DD/MM/YYYY HH:mm");
    }
    return "";
  }

  function dateToDatabase(strDate) {
    if (moment(strDate, "DD/MM/YYYY").isValid()) {
      return moment(strDate).format("YYYY-MM-DD HH:mm:ss");
    }
    return strDate;
  }

  function returnDays(date) {
    let data1 = new Date()
    let data2 = new Date(date)
    let result = data2.getTime() - data1.getTime();
    let days = Math.ceil(result / (1000 * 60 * 60 * 24));

    if (days === -0) {
      days = 0
    }
    return days;
  }

  return {
    dateToClient,
    datetimeToClient,
    dateToDatabase,
    returnDays
  };
}
