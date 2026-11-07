# ARMCA-WEB – portail institutionnel Cloudflare

Base applicative full-stack pour le portail ARMCA : interface responsive, API Cloudflare Worker, Cloudflare D1, stockage privé R2, espace d'administration, candidatures et formulaire Jotform intégré.

> **Important – statut institutionnel :** cette archive est un livrable technique prêt à configurer. Elle ne constitue pas une autorisation de publication ni une validation officielle par l'ARMCA. Le logo officiel, les dirigeants, textes légaux, statistiques, projets, décisions et partenariats ne sont pas inventés. Les contenus doivent être validés et ajoutés par l'autorité compétente avant mise en production publique.

## Technologies
- Cloudflare Workers + assets statiques
- Hono / TypeScript
- Cloudflare D1 (SQL)
- Cloudflare R2 pour les pièces privées
- Cloudflare Turnstile (configuration facultative en développement, à rendre obligatoire en production)
- Formulaire Jotform fourni : https://form.jotform.com/263105243828051

## Démarrage rapide
1. Installer Node.js 20+ et npm.
2. Décompresser `ARMCA-WEB.zip`.
3. Dans le dossier du projet : `npm install`.
4. Créer la base : `npx wrangler d1 create armca-db`.
5. Copier le `database_id` retourné dans `wrangler.toml`.
6. Créer le bucket : `npx wrangler r2 bucket create armca-private-files`.
7. Appliquer le schéma : `npm run db:migrate:prod`.
8. Définir les secrets (voir `docs/DEPLOIEMENT-CLOUDFLARE.md`).
9. `npm run deploy`.

## Routes API principales
- `GET /api/health`
- `GET /api/tenders`, `GET /api/tenders/:id`
- `GET /api/projects`, `GET /api/news`, `GET /api/documents`
- `POST /api/contact`
- `POST /api/applications`
- `POST /api/admin/login`
- `GET /api/admin/applications`
- `PATCH /api/admin/applications/:id`
- `GET /api/admin/applications/:id/files/:index`
- `GET /api/admin/export.csv`
- `POST /api/admin/tenders`

## Limites à traiter avant une exploitation officielle
- Remplacer l'authentification de démonstration SHA-256 par un mécanisme robuste (Argon2id ou PBKDF2 avec sel, politique de verrouillage, MFA et récupération contrôlée).
- Ajouter une gestion des comptes/permissions et une interface complète d'administration des contenus.
- Rendre Turnstile obligatoire et ajouter rate limiting/WAF, validation de fichiers par signature réelle et antivirus.
- Configurer un fournisseur e-mail transactionnel et tester la délivrabilité.
- Ajouter politique de confidentialité, durée de conservation, consentement et procédure de gestion des demandes RGPD / loi locale.
- Faire auditer la sécurité et les obligations légales par les responsables compétents.
