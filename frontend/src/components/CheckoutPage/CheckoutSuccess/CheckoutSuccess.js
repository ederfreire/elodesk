import React, { useState, useEffect, useContext } from 'react';
import { useHistory } from "react-router-dom";
import QRCode from 'qrcode.react';
import { SuccessContent, Total } from './style';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { FaCopy, FaCheckCircle } from 'react-icons/fa';
import { useDate } from "../../../hooks/useDate";
import { toast } from "react-toastify";
import { AuthContext } from '../../../context/Auth/AuthContext';
import { formatCurrency } from '../../../helpers/currencyHelper';
import { SocketContext } from '../../../context/Socket/SocketContext';
import { i18n } from "../../../translate/i18n";

function CheckoutSuccess(props) {
  const { pix } = props;
  const socketManager = useContext(SocketContext);
  const [pixString,] = useState(pix?.qrcode?.qrcode || '');
  const [stripeURL,] = useState(pix.stripeURL);
  const [asaasURL,] = useState(pix.asaasURL);
  const [mercadopagoURL,] = useState(pix.mercadopagoURL);
  const [valorext,] = useState(pix.valorext);
  const [copied, setCopied] = useState(false);
  const history = useHistory();

  const { dateToClient } = useDate();
  const { user, socket } = useContext(AuthContext);
  const companyId = user.companyId;

  useEffect(() => {
    const onCompanyPayment = (data) => {
      if (data.action === "CONCLUIDA") {
        toast.success(`${i18n.t("checkout.licenseRenewed")} ${dateToClient(data.company.dueDate)}!`);
        setTimeout(() => {
          history.push("/");
        }, 4000);
      }
    }
    socket.on(`company-${companyId}-payment`, onCompanyPayment);
    return () => {
      socket.off(`company-${companyId}-payment`, onCompanyPayment);
    }
  }, [history, dateToClient, socketManager]);

  const handleCopyQR = () => {
    setTimeout(() => setCopied(false), 1000);
    setCopied(true);
  };

  const payBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 280,
    padding: '11px 20px',
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'none',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 8,
    background: 'transparent',
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  };

  return (
    <div style={{ padding: '4px 0' }}>
      <Total>
        <p><span>{i18n.t("checkout.total")}</span></p>
        <strong>{formatCurrency(valorext)}</strong>
      </Total>

      <SuccessContent>
        {pixString && (
          <>
            <div style={{
              borderRadius: 8,
              padding: 16,
              marginTop: 4,
              border: '1px solid rgba(0,0,0,0.08)',
            }}>
              <QRCode value={pixString} size={160} />
            </div>

            <CopyToClipboard text={pixString} onCopy={handleCopyQR}>
              <button className="copy-button" type="button">
                {copied ? (
                  <>
                    <span>{i18n.t("checkout.copied")}</span>
                    <FaCheckCircle size={14} />
                  </>
                ) : (
                  <>
                    <span>{i18n.t("checkout.copyQrPix")}</span>
                    <FaCopy size={14} />
                  </>
                )}
              </button>
            </CopyToClipboard>

            <span>{i18n.t("checkout.pixInstructions")}</span>
            <div style={{ height: 12 }} />
          </>
        )}

        {stripeURL && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <button onClick={() => window.open(stripeURL, '_blank')} type="button" style={payBtnStyle}>
              💳 {i18n.t("checkout.payWithCard")}
            </button>
          </div>
        )}

        {mercadopagoURL && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <button onClick={() => window.open(mercadopagoURL, '_blank')} type="button" style={payBtnStyle}>
              🏦 {i18n.t("checkout.payWithMercadoPago")}
            </button>
          </div>
        )}

        {asaasURL && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <button onClick={() => window.open(asaasURL, '_blank')} type="button" style={payBtnStyle}>
              🏦 {i18n.t("checkout.payWithAsaas")}
            </button>
          </div>
        )}
      </SuccessContent>
    </div>
  );
}

export default CheckoutSuccess;
