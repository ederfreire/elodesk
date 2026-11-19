package main

// Entrega de áudio pronto para dentro de uma ligação.
//
// POR QUE ISTO EXISTE
//
// O buffer de captura da chamada (FeedCapturedPCM) foi feito para áudio AO
// VIVO, vindo do microfone. Ele tem duas travas que servem para manter a
// latência baixa nesse cenário:
//
//   - o anel guarda no máximo ~300 ms; escrever mais do que isso de uma vez
//     descarta o começo e mantém só o final (ver ringFloat32.Write);
//   - depois de cada escrita, tudo que passa de ~120 ms é jogado fora.
//
// Isso é correto para o microfone, onde o áudio chega em pedacinhos no ritmo
// do relógio. Mas quem toca um áudio PRONTO — a URA sintetizando uma frase, a
// música de espera, a campanha de voz — tem o buffer inteiro na mão e era
// tentador entregar tudo de uma vez.
//
// E era exatamente isso que fazia a URA atender e não falar nada: uma saudação
// de 5 segundos entregava 80.000 amostras, o anel guardava as últimas ~4.800 e
// o corte reduzia a ~1.900. Quem ligava ouvia o últimos 120 ms da última
// sílaba — na prática, silêncio.
//
// A solução é entregar no ritmo do relógio, em blocos menores que o limite de
// corte, mantendo uma folga pequena à frente para o codificador nunca ficar
// sem dados (era essa falta de folga que causava o áudio "picotado" quando se
// tentou paginar antes).

import (
	"context"
	"errors"
	"time"
)

const (
	pcmSampleRate = 16000
	// Bloco de 40 ms = 2 quadros de 20 ms do codificador. Bem abaixo dos
	// 120 ms em que o anel começa a descartar.
	pcmChunkMs = 40
	// Folga mantida à frente do codificador. Sem ela, qualquer atraso do
	// agendador deixa o codificador sem dados e ele emite um quadro de
	// silêncio — o "picotado". Com 80 ms há duas margens de sobra e ainda
	// se fica abaixo do limite de corte.
	pcmCushionMs = 80
)

// feedPCMRealtime injeta `pcm` (mono, 16 kHz, -1..1) na ligação, no ritmo em
// que o áudio é consumido.
//
// `mirror`, quando informado, recebe uma cópia de cada bloco — usado para a
// gravação da chamada.
//
// Devolve erro se a ligação cair no meio, para quem chamou saber que o áudio
// não foi ouvido por inteiro.
func feedPCMRealtime(
	ctx context.Context,
	sess *Session,
	callID string,
	pcm []float32,
	mirror func([]float32),
) error {
	if sess == nil || sess.reg == nil || len(pcm) == 0 {
		return nil
	}

	bloco := pcmSampleRate * pcmChunkMs / 1000
	folga := time.Duration(pcmCushionMs) * time.Millisecond
	inicio := time.Now()

	for i := 0; i < len(pcm); i += bloco {
		// A ligação pode cair no meio da frase. Sem esta checagem
		// continuaríamos alimentando uma chamada que não existe mais.
		ac, vivo := sess.reg.get(callID)
		if !vivo || ac == nil || ac.cm == nil {
			return errors.New("chamada encerrada durante a reprodução do áudio")
		}

		fim := i + bloco
		if fim > len(pcm) {
			fim = len(pcm)
		}
		parte := pcm[i:fim]

		ac.cm.FeedCapturedPCM(parte)

		if mirror != nil {
			copia := make([]float32, len(parte))
			copy(copia, parte)
			mirror(copia)
		}

		// O instante-alvo é calculado sempre a partir do início, e não somando
		// esperas: somar acumularia o atraso de cada ciclo e o áudio iria
		// ficando cada vez mais atrás do relógio numa frase longa.
		jaEntregue := time.Duration(fim) * time.Second / time.Duration(pcmSampleRate)
		alvo := inicio.Add(jaEntregue - folga)

		if espera := time.Until(alvo); espera > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(espera):
			}
		}
	}

	// Escoar a folga que ficou no buffer, mais um quadro, para o final da
	// frase não ser cortado quando o fluxo emenda a próxima ação.
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(folga + 40*time.Millisecond):
	}
	return nil
}
