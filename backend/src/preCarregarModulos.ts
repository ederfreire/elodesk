// Carrega ANTES de tudo os pacotes que não sobrevivem ao "congelamento" do
// JavaScript feito pelo @itsliaaa/starforge (dependência do Baileys).
//
// O starforge (lib/constant/shim.js) deixa Function.prototype somente-leitura
// quando é carregado. O SDK de fala da Microsoft (transcrição de áudio) usa o
// pacote "bytesish", que ao ser carregado faz `bytes.toString = ...` — com o
// protótipo congelado isso lança:
//   TypeError: Cannot assign to read only property 'toString' of function
// e o backend cai em loop no PM2. Carregando o SDK primeiro, a atribuição
// acontece antes do congelamento e tudo segue normal.
import "microsoft-cognitiveservices-speech-sdk";
