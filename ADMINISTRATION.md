# Administration et rôles

Rôles prévus dans la base :
- `super_admin` : accès global.
- `tenders_manager` : gestion des appels et candidatures.
- `communications` : contenus éditoriaux (à compléter dans l'interface).
- `legal` : contrôle des contenus juridiques (à compléter).
- `evaluator` : consultation et mise à jour des candidatures attribuées (filtrage d'affectation à renforcer avant production).
- `reader` : consultation autorisée.

L'interface actuelle couvre la connexion, la liste des candidatures, le changement de statut et l'export CSV. La gestion des utilisateurs, affectations, observations détaillées, documents, projets, actualités et journal est exposée partiellement côté API/base et doit être finalisée pour un usage institutionnel complet.

## Initialisation du premier compte
Le schéma ne crée volontairement aucun compte administrateur ni mot de passe par défaut. Après migration, créez un hash avec :
```bash
node scripts-create-admin.mjs "une-phrase-de-passe-longue-et-unique"
```
Puis exécutez une insertion D1 avec un UUID généré et le hash retourné :
```sql
INSERT INTO admins (id,email,password_hash,role,active)
VALUES ('UUID_ICI','admin@domaine-officiel.cd','HASH_ICI','super_admin',1);
```
Cette méthode de hash est un bootstrap de démonstration uniquement. Ne pas l'utiliser telle quelle pour des candidatures sensibles en production.
