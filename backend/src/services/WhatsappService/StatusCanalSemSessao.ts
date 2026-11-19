import Whatsapp from "../../models/Whatsapp";

/**
 * Status dos canais que não abrem sessão.
 *
 * O status de uma conexão do Baileys conta a história de uma sessão viva:
 * OPENING enquanto pareia, CONNECTED quando o socket sobe, DISCONNECTED
 * quando cai. A API Oficial não tem nada disso — não há socket, não há QR,
 * não há o que "conectar". A Meta simplesmente aceita ou recusa cada
 * requisição HTTP conforme as credenciais.
 *
 * Por isso a conexão oficial nascia em OPENING e ficava lá para sempre: o
 * card mostrava "CONECTANDO" e integridade "Instável" mesmo com mensagem
 * indo e voltando normalmente. O número assustava sem motivo.
 *
 * Aqui o status passa a significar o que de fato importa nesses canais:
 * a conexão está configurada para operar?
 *
 *   CONNECTED     tem número e token — pode enviar
 *   DISCONNECTED  falta credencial — não vai funcionar
 *
 * Isso não afirma que o token é válido na Meta (só a Meta sabe, a cada
 * requisição); afirma que a conexão está montada. Um token vencido aparece
 * como erro na hora do envio, com a mensagem da Meta, que é onde a
 * informação é útil.
 */

/** Canais que operam por API e não mantêm sessão. */
const CANAIS_SEM_SESSAO = ["whatsapp_oficial"];

export const canalSemSessao = (channel?: string): boolean =>
  CANAIS_SEM_SESSAO.includes(String(channel || ""));

/**
 * Status que o canal sem sessão deve ter, a partir das credenciais.
 * Devolve null quando o canal não é desse tipo — quem chama mantém o valor
 * original nesse caso.
 */
export const statusPorCredencial = (dados: {
  channel?: string;
  phone_number_id?: string | null;
  send_token?: string | null;
}): string | null => {
  if (!canalSemSessao(dados.channel)) return null;

  const temNumero = !!String(dados.phone_number_id || "").trim();
  const temToken = !!String(dados.send_token || "").trim();

  return temNumero && temToken ? "CONNECTED" : "DISCONNECTED";
};

/**
 * Corrige o status na lista já carregada, sem gravar no banco.
 *
 * Existe para as conexões que já estão salvas com o status antigo: elas
 * passam a exibir o valor certo na hora, sem depender de o usuário abrir e
 * salvar cada uma.
 */
export const corrigirStatusNaLista = (whatsapps: Whatsapp[]): Whatsapp[] => {
  whatsapps.forEach(w => {
    const correto = statusPorCredencial({
      channel: (w as any).channel,
      phone_number_id: (w as any).phone_number_id,
      send_token: (w as any).send_token
    });

    if (correto && (w as any).status !== correto) {
      (w as any).status = correto;
      // Sem retentativa não há por que a integridade aparecer como instável.
      if (correto === "CONNECTED") (w as any).retries = 0;
    }
  });

  return whatsapps;
};

export default {
  canalSemSessao,
  statusPorCredencial,
  corrigirStatusNaLista
};
