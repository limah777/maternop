# maternop-api

Manda um CEP e recebe os locais de coleta de leite materno mais próximos: nome, contato, endereço, distância e link do Google Maps.

A lista de locais é a da [rBLH/Fiocruz](https://rblh.fiocruz.br/localizacao-dos-blhs).

## Rodar

```bash
npm install
npm start
```

A API sobe na porta 8000 e fica acessível pelo IP da máquina, não só em localhost. O endereço aparece no terminal e o navegador abre a documentação nesse IP.

Na mesma rede Wi-Fi, o celular ou outro PC usa o mesmo endereço. Exemplo:

```
http://192.168.0.15:8000/docs
```

## Consulta

```
GET /locais?cep=01310100&limite=5
```

O CEP pode ir com ou sem hífen. `limite` vai de 1 a 20. Sem ele, a API devolve 5 locais.

```
GET /health
```

## Atualizar os locais

```bash
npm run atualizar
```
