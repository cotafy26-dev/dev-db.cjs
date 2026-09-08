# IA local com Ollama

Esta máquina não tem GPU dedicada, então o modelo roda em CPU: funcional para
desenvolvimento, porém lento (~10–40 s por resposta) e com function calling menos
confiável em modelos pequenos.

## Passos

1. Instale o Ollama: https://ollama.com/download
2. Baixe um modelo com suporte a ferramentas:

   ```bash
   ollama pull hermes3:8b        # recomendado (melhor tool calling)
   # alternativa mais rápida em CPU (tool calling mais fraco):
   ollama pull llama3.2:3b
   ```

3. O `.env` já vem configurado para Ollama:

   ```
   AI_PROVIDER=ollama
   AI_BASE_URL=http://localhost:11434/v1
   AI_API_KEY=ollama
   AI_MODEL=hermes3:8b
   ```

4. Teste: `GET http://localhost:3333/api/ai/health`

## Sem modelo (desenvolvimento rápido)

```
AI_PROVIDER=stub
```

O `StubProvider` reconhece por regex as frases mais comuns em PT-BR
("registre uma despesa de 150 de combustível", "quanto vendi hoje?", etc.) e
aciona as mesmas ferramentas — útil para validar a stack sem gastar CPU.

## Produção / endpoint hospedado

Qualquer endpoint compatível com a API de chat da OpenAI:

```
AI_PROVIDER=openrouter
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-...
AI_MODEL=nousresearch/hermes-3-llama-3.1-70b
```
