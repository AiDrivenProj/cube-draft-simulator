# 🐳 Guida Docker - Cube Draft Simulator

## 📋 Prerequisiti

- Docker installato sul tuo sistema
- Docker Compose installato (di solito incluso con Docker Desktop)

## 🚀 Avvio dell'applicazione

### Metodo 1: Docker Compose (Consigliato)

```bash
# Costruisci e avvia il container
docker-compose up -d

# Visualizza i log
docker-compose logs -f

# Ferma il container
docker-compose down
```

### Metodo 2: Docker diretto

```bash
# Costruisci l'immagine
docker build -t cubedraft-simulator .

# Avvia il container
docker run -d -p 0.0.0.0:3000:80 --name cubedraft-simulator cubedraft-simulator

# Ferma il container
docker stop cubedraft-simulator
docker rm cubedraft-simulator
```

## 🌐 Accesso dall'applicazione

### Sul tuo computer
Apri il browser e vai su:
- `http://localhost:3000`

### Da altri dispositivi sulla stessa rete WiFi

1. **Trova il tuo indirizzo IP locale:**
   ```bash
   # Su Mac/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Oppure
   ipconfig getifaddr en0
   ```

2. **Accedi dall'altro dispositivo:**
   - Apri il browser sul tuo telefono, tablet o altro computer
   - Vai su `http://<TUO-IP>:3000`
   - Esempio: `http://192.168.1.100:3000`

## 🔧 Comandi utili

```bash
# Ricostruisci l'immagine dopo modifiche al codice
docker-compose up -d --build

# Visualizza i container in esecuzione
docker ps

# Visualizza i log in tempo reale
docker-compose logs -f

# Riavvia il container
docker-compose restart

# Ferma e rimuovi tutto
docker-compose down
```

## 🔒 Note sulla sicurezza

- Il binding su `0.0.0.0:3000` permette l'accesso da qualsiasi dispositivo sulla tua rete locale
- Assicurati che il tuo firewall permetta le connessioni sulla porta 3000
- Non esporre questa configurazione su Internet senza ulteriori misure di sicurezza

## 🐛 Risoluzione problemi

### Il container non si avvia
```bash
# Controlla i log per errori
docker-compose logs

# Verifica che la porta 3000 non sia già in uso
lsof -i :3000
```

### Non riesco ad accedere da altri dispositivi
1. Verifica che il container sia in esecuzione: `docker ps`
2. Controlla il firewall del tuo Mac
3. Assicurati che i dispositivi siano sulla stessa rete WiFi
4. Verifica l'indirizzo IP con `ipconfig getifaddr en0`

### Modifiche al codice non si riflettono
```bash
# Ricostruisci l'immagine
docker-compose down
docker-compose up -d --build
```
