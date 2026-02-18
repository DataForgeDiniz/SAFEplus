# SAFEplus (Projeto Hobby)

Cofre de senhas **client-side** (dados ficam somente no navegador) com **WebCrypto (AES‑GCM)** e UI **Tailwind**.

> **Atenção:** projeto pessoal para estudos. Use com dados de teste. Para produção, adote backend seguro, CSP rígido e auditoria de código.

## Funcionalidades
- Criar/editar itens com **nome, usuário, senha, URL e ícone (emoji)**
- **Copiar senha** (clipboard) e **mostrar** sob demanda
- **Gerar senha forte** com 1 clique
- **Buscar** e **favoritar**
- **Bloquear/Desbloquear** com **senha mestre**
- **Criptografia local**: PBKDF2 → AES‑GCM
- **Exportar/Importar** (JSON cifrado)

## Como rodar
Abra `index.html` no navegador. Opcionalmente:
```bash
python -m http.server 5173
# http://localhost:5173