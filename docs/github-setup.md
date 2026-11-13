> Developer setup for sync work that is not in Doca 1.0.0. The shipped extension does not use these credentials and has no sign-in or sync screen. You do not need this page to build, load or use Doca.

# Set up GitHub sync

Doca can sync your workspaces through a private GitHub repository that you own. You create the repository and a token one time. They are for sync work in a later release.

You need:

- A GitHub account.
- The Doca source code.

The token can access only the repository that you select for it. Doca writes its files to the `doca` folder of that repository.

## 1. Create the repository

1. Open [Create the repository](https://github.com/new?name=doca-sync&description=Doca+workspace+sync&visibility=private). The link fills in the name `doca-sync`, a description and **Private**.
2. Make sure that **Private** is selected.
3. Click **Create repository**.

## 2. Create the token

1. Open [Create the token](https://github.com/settings/personal-access-tokens/new?name=Doca+sync&description=Doca+workspace+sync&expires_in=none&contents=write). The link fills in the name, no expiration, and the **Contents** permission with read and write access.
2. Under **Repository access**, select **Only select repositories**.
3. In the **Selected repositories** list, select `doca-sync`.
4. Under **Permissions**, make sure that **Contents** has **Read and write** access.
5. Click **Generate token**.
6. Copy the token. GitHub shows it only one time.

If your account is in an organization that sets a maximum token lifetime, GitHub can block the "no expiration" setting. Select the longest expiration that it allows, and create a new token before it expires.

## 3. Keep the token for later

Store the token and the `owner/doca-sync` repository name in a safe place. Doca 1.0.0 has no screen that takes them, and `.env.example` has no GitHub entry yet.

To sync between two computers, use the same repository on both computers. You can use the same token, or a second token for the same repository.

Keep the token private. Anyone with the token can read and change the files in the repository.

## Problems

| Error | Cause | Fix |
|---|---|---|
| `GitHub request failed with HTTP 401` | The token is wrong, expired or revoked. | Do [step 2](#2-create-the-token) again and save the new token. |
| `GitHub request failed with HTTP 404` | The repository name is wrong, or the token cannot access the repository. | Check the `owner/name` value. Make sure that the token has the repository in **Selected repositories**. |
| `GitHub request failed with HTTP 403` | The token does not have write access to **Contents**, or GitHub limits the request rate. | Check the **Contents** permission of the token. If the error text names a rate limit, wait and try again. |
