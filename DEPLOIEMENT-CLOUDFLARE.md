# Guide de déploiement Cloudflare

## A. Préparation
Le déploiement est possible depuis un ordinateur. Depuis Android, utilisez un navigateur en mode ordinateur avec le tableau de bord Cloudflare ou un terminal cloud compatible Node.js.

Créer/ouvrir un compte Cloudflare et installer Node.js 20+ et npm dans un environnement de développement.

## B. Déployer D1
```bash
npm install
npx wrangler d1 create armca-db
```
Copier l'identifiant de base retourné dans `wrangler.toml` à la place de `REMPLACER_PAR_ID_D1`, puis :
```bash
npm run db:migrate:prod
```

## C. Déployer R2
```bash
npx wrangler r2 bucket create armca-private-files
```
Le bucket est lié sous `PRIVATE_FILES`. Il ne doit pas être rendu public. Les fichiers de candidature sont accessibles uniquement via une route API authentifiée.

## D. Secrets et variables
Créer un secret JWT fort :
```bash
npx wrangler secret put JWT_SECRET
```
Configurer les clés Turnstile :
```bash
npx wrangler secret put TURNSTILE_SECRET
```
Définir `TURNSTILE_SITE_KEY` comme variable Worker dans le tableau de bord. Pour les e-mails, adapter un fournisseur transactionnel (par exemple API compatible HTTP) :
```bash
npx wrangler secret put EMAIL_API_KEY
```
Variables `EMAIL_API_URL` et `EMAIL_FROM` dans les variables Worker. Le format JSON d'envoi dépend du fournisseur choisi et doit être adapté dans `sendEmail()`.

## E. Développement et publication
```bash
npm run dev
npm run deploy
```
Le site est servi par les assets Cloudflare Workers configurés dans `wrangler.toml`.

## F. Turnstile
Dans Cloudflare Dashboard > Turnstile, créer un widget pour le domaine. Renseigner la clé publique `TURNSTILE_SITE_KEY` et la clé secrète `TURNSTILE_SECRET`. Avant production, intégrer le widget client dans les formulaires et rendre la validation serveur obligatoire (le backend refuse alors les jetons manquants).

## G. Domaine personnalisé
Dans Workers & Pages, ouvrir le Worker déployé, puis Settings > Domains & Routes pour associer le domaine institutionnel autorisé. Vérifier DNS, HTTPS et redirections.

## H. Vérifications avant ouverture
- Tester mobile Android, tablette et ordinateur.
- Tester échéances en heure de Kinshasa (Africa/Kinshasa, UTC+2).
- Tester dépôt, accusé de réception, accès administrateur, téléchargement privé et export CSV.
- Vérifier sauvegardes D1/R2, journalisation, alertes et politique de conservation.
- Faire un audit de sécurité indépendant.
