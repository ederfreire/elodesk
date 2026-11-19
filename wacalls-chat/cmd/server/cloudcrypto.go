package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var cloudKeyOnce sync.Once
var cloudKey []byte

// cloudCryptoKey deriva uma chave AES de 32 bytes a partir do SESSION_SECRET.
// Antes existia um fallback fixo no código ("...change-me"), o que significava
// que qualquer instalação sem SESSION_SECRET usava uma chave pública — quem
// tivesse o banco conseguiria decifrar os tokens da Cloud API. Agora, sem
// SESSION_SECRET, geramos uma chave aleatória e a persistimos em
// `.wacalls_secret` (0600) ao lado do banco, para os segredos continuarem
// legíveis entre reinícios sem nunca depender de um valor conhecido.
func cloudCryptoKey() []byte {
	cloudKeyOnce.Do(func() {
		secret := strings.TrimSpace(os.Getenv("SESSION_SECRET"))
		if secret == "" {
			secret = loadOrCreateLocalSecret()
		}
		sum := sha256.Sum256([]byte(secret + ":cloudapi:v1"))
		cloudKey = sum[:]
	})
	return cloudKey
}

func localSecretPath() string {
	if dir := strings.TrimSpace(os.Getenv("WACALLS_STATE_DIR")); dir != "" {
		return filepath.Join(dir, ".wacalls_secret")
	}
	return ".wacalls_secret"
}

func loadOrCreateLocalSecret() string {
	path := localSecretPath()
	if b, err := os.ReadFile(path); err == nil {
		if v := strings.TrimSpace(string(b)); len(v) >= 32 {
			return v
		}
	}
	buf := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, buf); err != nil {
		// Última linha de defesa: sem entropia não há como cifrar com
		// segurança, então falhamos alto em vez de usar chave previsível.
		panic("cloudcrypto: sem fonte de entropia para gerar a chave local")
	}
	v := hex.EncodeToString(buf)
	if err := os.WriteFile(path, []byte(v), 0o600); err != nil {
		slog.Warn("cloudcrypto: não foi possível persistir a chave local; defina SESSION_SECRET", "path", path, "err", err)
	} else {
		slog.Warn("cloudcrypto: SESSION_SECRET ausente; chave aleatória gerada", "path", path)
	}
	return v
}

// encryptSecret returns base64(nonce || ciphertext) or "" for empty input.
func encryptSecret(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}
	block, err := aes.NewCipher(cloudCryptoKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(ct), nil
}

func decryptSecret(enc string) (string, error) {
	if enc == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(cloudCryptoKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ns := gcm.NonceSize()
	if len(raw) < ns {
		return "", errors.New("cloudcrypto: ciphertext too short")
	}
	nonce, ct := raw[:ns], raw[ns:]
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		// Compatibilidade: instalações antigas cifraram com a chave estática
		// que existia no código. Se ainda houver segredos gravados assim,
		// decifra com a chave legada para não perder a configuração — o
		// próximo save já regrava com a chave nova.
		if pt2, err2 := decryptWithLegacyKey(nonce, ct); err2 == nil {
			return pt2, nil
		}
		return "", err
	}
	return string(pt), nil
}

// decryptWithLegacyKey tenta a chave estática usada antes desta versão.
func decryptWithLegacyKey(nonce, ct []byte) (string, error) {
	sum := sha256.Sum256([]byte("wacalls-dev-only-secret-change-me:cloudapi:v1"))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}
