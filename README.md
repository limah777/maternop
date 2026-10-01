# Maternop

API que recebe um CEP e devolve os locais de coleta de leite materno mais próximos.

A lista sai da [rBLH/Fiocruz](https://rblh.fiocruz.br/localizacao-dos-blhs). O CEP é consultado na AwesomeAPI e, se não vier coordenada, na BrasilAPI.

## Instalar

```bash
npm install
```

## Rodar

```bash
npm start
```

Sobe em http://127.0.0.1:8000. A documentação fica em `/docs`.

## Uso

```
GET /locais?cep=01310100&limite=5
```

`cep` pode ir com ou sem hífen. `limite` vai de 1 a 20 (padrão 5).

Cada local volta com nome, contato, endereço, distância em km e link do Google Maps.

```
GET /health
```

## Atualizar os locais

```bash
npm run atualizar
```
