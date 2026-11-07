# Sécurité, confidentialité et conformité

## Mesures présentes
- Les pièces jointes sont stockées dans R2 sans URL publique.
- Les téléchargements de dossiers passent par une route nécessitant un jeton administrateur.
- Les réponses de fichiers utilisent `Cache-Control: private, no-store` et `X-Content-Type-Options: nosniff`.
- Les requêtes SQL utilisent des paramètres liés.
- Les contenus utilisateur sont échappés dans le rendu public du navigateur.
- Les secrets ne sont pas placés dans le dépôt.

## Points bloquants avant production
1. Remplacer le hash SHA-256 de démonstration par PBKDF2/Argon2id avec sel, MFA et limitation des tentatives.
2. Ajouter rate limiting sur login, contact et candidatures.
3. Ajouter Turnstile côté navigateur et serveur; le mode sans secret est uniquement pour développement.
4. Détecter les types de fichiers par signature binaire, analyser les fichiers, imposer des limites et neutraliser les noms.
5. Appliquer les permissions à chaque opération et restreindre les évaluateurs à leurs dossiers attribués.
6. Ajouter CSRF si authentification par cookie, politique CSP, HSTS et contrôles de sécurité.
7. Ajouter sauvegardes, rotation des secrets, alertes, rétention et procédure d'incident.
8. Publier une politique de confidentialité approuvée et définir la base légale, les finalités, durées de conservation, droits et contact responsable.
9. Effectuer tests d'intrusion et revue juridique avant toute collecte réelle.

Ne jamais charger de documents confidentiels dans un espace public. Ne pas utiliser de vraies données personnelles lors des tests.
