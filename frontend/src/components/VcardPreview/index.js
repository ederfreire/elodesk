import React, { useEffect, useState, useContext } from 'react';
import { useHistory } from "react-router-dom";
import toastError from "../../errors/toastError";
import api from "../../services/api";

import Avatar from "@material-ui/core/Avatar";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";

import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";

import { Button, Divider } from "@material-ui/core";
import { isNil } from 'lodash';
import ShowTicketOpen from '../ShowTicketOpenModal';

const VcardPreview = ({ contact, numbers, queueId, whatsappId, channel }) => {
    const history = useHistory();
    const { user } = useContext(AuthContext);
    // Sem isso, clicar em "Conversar" abria o ticket mas a lista continuava
    // na aba em que o operador estava (normalmente "Aguardando") — dava a
    // impressão de que o atendimento tinha ido pra fila de espera, quando na
    // verdade ele já é criado como "open" (Atendendo) pelo backend.
    const { setTabOpen } = useContext(TicketsContext);

    const companyId = user.companyId;

    const [openAlert, setOpenAlert] = useState(false);
    const [userTicketOpen, setUserTicketOpen] = useState("");
    const [queueTicketOpen, setQueueTicketOpen] = useState("");

    const [selectedContact, setContact] = useState({
        id: 0,
        name: "",
        number: 0,
        // O render usa `urlPicture` (ver <Avatar src=...>), mas o estado
        // inicial declarava `profilePicUrl` — chave diferente. Enquanto o
        // fetch não terminava, o Avatar recebia a string "undefined" como
        // src e ficava sem foto. Padronizado no nome que o render espera.
        urlPicture: ""
    });

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            const fetchContacts = async () => {
                try {
                    if (isNil(numbers)) {
                        return
                    }
                    const number = numbers.replace(/\D/g, "");
                    // Muitos cartões do WhatsApp vêm com "FN:" vazio (só
                    // telefone). Nesse caso usamos o próprio número como
                    // nome, porque o backend exige name no POST /contacts —
                    // sem isso ele respondia 400 "name is a required field"
                    // e o cartão ficava em branco na tela.
                    // Blindagem extra: ainda que `contact` e `numbers` falhem
                    // (ex.: prop vier com espaços, ou o parser do vCard não
                    // reconhecer o formato do cartão), garantimos aqui que
                    // nunca vai um name vazio pro POST — se tudo mais faltar,
                    // usa o número já sem formatação, ou por último um rótulo
                    // fixo, nunca "".
                    const nomeExibido =
                        String(contact || "").trim() ||
                        String(numbers || "").trim() ||
                        (number ? `Contato ${number}` : "") ||
                        "Contato sem nome";
                    if (number.length < 8) {
                        setContact(prev => ({
                            ...prev,
                            name: nomeExibido,
                            number: numbers
                        }));
                        return
                    }
                    const getData = await api.get(`/contacts/profile/${number}`, { params: { channel: channel } });

                    if (getData.data.contactId && getData.data.contactId !== 0) {
                        let obj = {
                            id: getData.data.contactId,
                            name: nomeExibido,
                            number: numbers,
                            urlPicture: getData.data.urlPicture
                        }

                        setContact(obj)
                    } else {
                        let contactObj = {
                            // .trim() de novo aqui: nomeExibido já não deveria
                            // vir vazio, mas o POST é o ponto de não-retorno —
                            // se por algum motivo ainda chegar "" ou só
                            // espaços, o backend rejeita com 400 "name is a
                            // required field" e o card trava em branco pra
                            // sempre (o catch abaixo não reseta o estado).
                            name: (nomeExibido && nomeExibido.trim()) || `Contato ${number}`,
                            number: number,
                            email: "",
                            companyId: companyId
                        }

                        const { data } = await api.post("/contacts", contactObj);
                        // A resposta do POST /contacts traz a foto em
                        // `profilePicUrl`, mas o render lê `urlPicture` —
                        // gravar `data` cru deixava o contato novo sempre sem
                        // foto. Normaliza aqui, e garante o nome vindo do
                        // vCard caso o backend devolva vazio.
                        setContact({
                            ...data,
                            name: data?.name || nomeExibido,
                            urlPicture: data?.urlPicture || data?.profilePicUrl || ""
                        })
                    }

                } catch (err) {
                    toastError(err);
                    // Se o POST falhar (ex.: número inválido pro CheckContactNumber,
                    // sem WhatsApp, etc.) o card ficava travado no estado inicial
                    // {name: "", number: 0} pra sempre — sem nome visível e com
                    // "Conversar" desabilitado, sem nenhuma pista pro operador do
                    // que aconteceu além do toast. Mostramos ao menos o que o
                    // vCard trouxe, mesmo sem id (o botão continua desabilitado
                    // até existir um contactId válido).
                    setContact(prev => ({
                        ...prev,
                        name: prev.name || nomeExibido,
                        number: prev.number || 0
                    }));
                }
            };
            fetchContacts();
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [companyId, contact, numbers]);

    const handleCloseAlert = () => {
        setOpenAlert(false);
        setOpenAlert(false);
        setUserTicketOpen("");
        setQueueTicketOpen("");
    };

    const handleNewChat = async () => {
        try {
            const { data: ticket } = await api.post("/tickets", {
                contactId: selectedContact.id,
                userId: user.id,
                status: "open",
                queueId,
                companyId: companyId,
                whatsappId
            });

            // Muda para a aba "Atendendo" antes de navegar — o ticket nasce
            // com status "open", então é lá que ele aparece.
            if (typeof setTabOpen === "function") {
                setTabOpen(ticket?.status || "open");
            }
            history.push(`/tickets/${ticket.uuid}`);
        } catch (err) {
            const ticket = JSON.parse(err.response.data.error);

            if (ticket.userId !== user?.id) {
                setOpenAlert(true);
                setUserTicketOpen(ticket?.user?.name);
                setQueueTicketOpen(ticket?.queue?.name);
            } else {
                setOpenAlert(false);
                setUserTicketOpen("");
                setQueueTicketOpen("");

                if (typeof setTabOpen === "function") {
                    setTabOpen(ticket?.status || "open");
                }
                history.push(`/tickets/${ticket.uuid}`);
            }
        }
    }

    return (
        <>
            <div style={{
                minWidth: "250px",
            }}>
                <ShowTicketOpen
                    isOpen={openAlert}
                    handleClose={handleCloseAlert}
                    user={userTicketOpen}
                    queue={queueTicketOpen}
                />
                <Grid container spacing={1}>
                    <Grid item xs={2}>
                        <Avatar src={`${selectedContact?.urlPicture}`} />
                    </Grid>
                    <Grid item xs={9}>
                        <Typography
                            style={{ marginTop: "12px", marginLeft: "10px" }}
                            color="primary"
                            variant="subtitle1"
                            gutterBottom
                        >
                            {selectedContact.name}
                        </Typography>
                    </Grid>
                    <Grid item xs={12}>
                        <Divider />
                        <Button
                            fullWidth
                            color="primary"
                            onClick={handleNewChat}
                            disabled={!selectedContact.number}
                        >Conversar</Button>
                    </Grid>
                </Grid>
            </div>
        </>
    );

};

export default VcardPreview;