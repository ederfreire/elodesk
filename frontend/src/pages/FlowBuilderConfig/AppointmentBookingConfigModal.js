import React, { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography
} from "@material-ui/core";

const messageSections = [
  {
    title: "Etapas do agendamento",
    fields: [
      {
        name: "servicePrompt",
        label: "Escolha do serviço",
        helperText: "A lista de serviços e a instrução para cancelar são acrescentadas automaticamente."
      },
      {
        name: "professionalPrompt",
        label: "Escolha do profissional",
        helperText: "A lista de profissionais e a instrução para cancelar são acrescentadas automaticamente."
      },
      {
        name: "slotPrompt",
        label: "Escolha do horário",
        helperText: "A lista de horários e a instrução para cancelar são acrescentadas automaticamente."
      },
      {
        name: "confirmationPrompt",
        label: "Confirmação dos dados",
        helperText: "Variáveis disponíveis: {{service}}, {{professional}} e {{when}}."
      }
    ]
  },
  {
    title: "Conclusão e cancelamento",
    fields: [
      {
        name: "bookingConfirmed",
        label: "Reserva confirmada",
        helperText: "Variáveis disponíveis: {{service}}, {{professional}} e {{when}}."
      },
      { name: "bookingCancelled", label: "Cliente cancelou o agendamento" },
      { name: "bookingNotConfirmed", label: "Cliente não confirmou a reserva" }
    ]
  },
  {
    title: "Avisos e erros",
    fields: [
      { name: "noServices", label: "Nenhum serviço disponível para agendamento" },
      { name: "noProfessionals", label: "Nenhum profissional habilitado para o serviço" },
      { name: "noSlots", label: "Nenhum horário disponível" },
      { name: "slotLookupError", label: "Falha ao consultar horários" },
      { name: "slotUnavailable", label: "Horário reservado por outra pessoa" },
      { name: "bookingFailure", label: "Falha ao confirmar a reserva" },
      { name: "invalidReply", label: "Resposta inválida" }
    ]
  }
];

const AppointmentBookingConfigModal = ({ open, data, onSave, onUpdate, close }) => {
  const [messages, setMessages] = useState({});
  const isEditing = open === "edit";

  useEffect(() => {
    if (open) {
      const savedMessages = open === "edit" ? data?.data?.messages : null;
      setMessages(
        savedMessages &&
          typeof savedMessages === "object" &&
          !Array.isArray(savedMessages)
          ? savedMessages
          : {}
      );
    }
  }, [open, data]);

  const handleSave = () => {
    const updatedNode = {
      ...data,
      data: {
        ...(data?.data || {}),
        messages
      }
    };

    if (isEditing) {
      onUpdate(updatedNode);
    } else {
      onSave({ messages });
      close(null);
    }
  };

  return (
    <Dialog open={Boolean(open)} onClose={() => close(null)} fullWidth maxWidth="md">
      <DialogTitle>Mensagens do agendamento de serviços</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="textSecondary" paragraph>
          Personalize os textos enviados em cada etapa. Deixe um campo vazio para manter a mensagem padrão.
        </Typography>
        {messageSections.map(section => (
          <div key={section.title} style={{ marginBottom: 24 }}>
            <Typography variant="subtitle1" style={{ fontWeight: 600, marginBottom: 8 }}>
              {section.title}
            </Typography>
            <Grid container spacing={2}>
              {section.fields.map(field => (
                <Grid item xs={12} key={field.name}>
                  <TextField
                    label={field.label}
                    value={typeof messages[field.name] === "string" ? messages[field.name] : ""}
                    onChange={event =>
                      setMessages(current => ({
                        ...current,
                        [field.name]: event.target.value
                      }))
                    }
                    helperText={field.helperText || "Deixe vazio para usar a mensagem padrão."}
                    fullWidth
                    multiline
                    rows={field.name === "confirmationPrompt" || field.name === "bookingConfirmed" ? 4 : 2}
                    variant="outlined"
                    margin="dense"
                  />
                </Grid>
              ))}
            </Grid>
          </div>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => close(null)}>Cancelar</Button>
        <Button color="primary" variant="contained" onClick={handleSave}>
          Salvar mensagens
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AppointmentBookingConfigModal;
