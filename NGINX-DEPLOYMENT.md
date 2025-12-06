# 🚀 Guide de déploiement Nginx pour l'application Judo

## ⚠️ Réponse à votre question : Votre config est-elle compatible ?

**Réponse courte** : Oui, mais avec des problèmes qui peuvent causer des bugs.

**Problèmes critiques détectés** :
1. ❌ **Socket.IO va se déconnecter** : Pas de timeouts adaptés pour les WebSockets
2. ❌ **Uploads > 1MB peuvent échouer** : Pas de `client_max_body_size` défini
3. ⚠️ **Cache non fonctionnel** : `proxy_cache_valid` sans zone de cache
4. ⚠️ **Cache trop agressif** : 1 an pour les statiques vs 1h dans votre app

---

## 📝 Deux options de correction

### Option 1 : Correction minimale (recommandé pour commencer)
Utilisez `nginx-minimal-fix.conf` - corrige juste les bugs de votre config actuelle.

### Option 2 : Configuration optimale
Utilisez `nginx-optimized.conf` - version complète avec optimisations et sécurité.

---

## 🔧 Comment appliquer la configuration

### 1️⃣ Sur votre serveur Digital Ocean

```bash
# Se connecter au droplet
ssh root@134.209.177.58

# Backup de la config actuelle
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Copier la nouvelle config (choisir minimal-fix ou optimized)
sudo nano /etc/nginx/sites-available/judo-app

# Coller le contenu de nginx-minimal-fix.conf ou nginx-optimized.conf
# Sauvegarder avec Ctrl+O puis Ctrl+X
```

### 2️⃣ Si vous utilisez nginx-optimized.conf, mettre à jour le chemin

Dans le fichier, remplacez `/chemin/vers/votre/app/public` par le vrai chemin :
```nginx
root /home/deploy/judo-JCLB/public;  # Exemple - adapter selon votre setup
```

### 3️⃣ Activer la configuration

```bash
# Créer le lien symbolique
sudo ln -sf /etc/nginx/sites-available/judo-app /etc/nginx/sites-enabled/judo-app

# Désactiver la config par défaut si elle existe
sudo rm -f /etc/nginx/sites-enabled/default

# Tester la config AVANT de redémarrer
sudo nginx -t
```

### 4️⃣ Appliquer les changements

```bash
# Si le test est OK :
sudo systemctl reload nginx

# Vérifier que nginx tourne
sudo systemctl status nginx
```

### 5️⃣ Tester l'application

```bash
# Vérifier que PM2 tourne
pm2 status

# Tester l'app
curl http://134.209.177.58

# Vérifier les logs nginx en cas de problème
sudo tail -f /var/log/nginx/error.log
```

---

## 🐛 Résolution de problèmes courants

### Erreur "nginx: [emerg] bind() to 0.0.0.0:80 failed"
Un autre processus utilise le port 80.
```bash
sudo lsof -i :80
sudo systemctl stop apache2  # Si Apache est installé
```

### Socket.IO ne se connecte pas
Vérifier les logs :
```bash
# Logs nginx
sudo tail -f /var/log/nginx/error.log

# Logs PM2
pm2 logs
```

### 502 Bad Gateway
L'app PM2 n'est pas démarrée :
```bash
pm2 restart all
pm2 status
```

---

## 🔐 Étape suivante : HTTPS (important pour production)

Une fois que tout fonctionne, installez un certificat SSL gratuit :

```bash
# Installer certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Si vous avez un nom de domaine (ex: judo.votredomaine.com)
sudo certbot --nginx -d judo.votredomaine.com

# Certbot configurera automatiquement HTTPS et la redirection HTTP->HTTPS
```

---

## 📊 Différences entre les configs

| Aspect | Votre config | minimal-fix | optimized |
|--------|--------------|-------------|-----------|
| Fonctionne | ⚠️ Bugs | ✅ Oui | ✅ Oui |
| Socket.IO | ❌ Timeout | ✅ OK | ✅ OK |
| Upload 10MB | ❌ Rejet | ✅ OK | ✅ OK |
| Cache | ❌ Non fonctionnel | ✅ Simplifié | ✅ Optimal |
| Sécurité | ❌ Aucune | ⚠️ Basique | ✅ Headers |
| Performance | ⚠️ Moyenne | ✅ Bonne | ✅ Excellente |

---

## 📞 Besoin d'aide ?

Si vous rencontrez des problèmes :
1. Vérifiez les logs : `sudo tail -f /var/log/nginx/error.log`
2. Vérifiez PM2 : `pm2 logs`
3. Testez la config : `sudo nginx -t`
