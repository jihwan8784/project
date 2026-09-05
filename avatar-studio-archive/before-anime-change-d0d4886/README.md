# Avatar Studio backup: before anime-model change

This archive preserves the Avatar Studio source exactly as it existed before the anime-style VRM push.

- Original GitHub repository: jihwan8784/----
- Original GitHub commit: d0d4886fabc01eda054b6f0993595975c17cdb12
- Equivalent Sites source commit: 4a61c97169a775b53140cdb178a4d3736c9e9891
- Git tree: 6c6c7b96d8e2efb87ea906d926a080b68bf2de9e
- Archive SHA-256: a46e1edcdeefa32489898564fcc9bdb9fe1729d974f8436f1054daaa201660dc
- Parts: 7

Restore:

```bash
cat avatar-studio-before-anime-change-d0d4886.tar.gz.part* > avatar-studio-before-anime-change-d0d4886.tar.gz
sha256sum avatar-studio-before-anime-change-d0d4886.tar.gz
mkdir restored-avatar-studio
tar -xzf avatar-studio-before-anime-change-d0d4886.tar.gz -C restored-avatar-studio
```
