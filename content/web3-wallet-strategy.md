---
title: "How to not get rekt: web3 wallet safety"
date: "2021-12-01"
description: "Create a web3 wallet strategy to keep your crypto assets safe."
taxonomies:
  tags:
    - "crypto"
extra:
  category: "Web3"
---

And like that it happened: I got rekt. Over $3000 in ETH gone in an instant (not to mention the SUSHI, AVAX and JOE).

I had connected my crypto wallet to a malicious dApp, handed over my seed phrase and ended up having someone move all of the assets in my wallet to theirs. And there was nothing I could do about it, nobody I could call. Then, it happened again (more on this later).

This type of experience is considered a rite of passage in crypto right now, which is unfortunate. These things happen largely due to a lack of understanding about how accounts and wallets work on the blockchain. Scammers take advantages of this, creating a real risk for users and a barrier to entry for those new to the space and/or without disposal income.

Let my tale be a cautionary one and learn from my mistakes. I learned a lot from my "How did I get rekt?" research and jotted down my primary takeaways in the hope others could avoid a similar experience.

## Don't give away your seed phrase!

When you first set up your crypto wallet, a list of words (i.e. a "seed phrase") is generated. This phrase acts as your credentials for the wallet and, in turn, gives you the ability to manage your accounts. It is also used to generate the private key for your accounts.

**Do not give anyone your seed phrase!**

Seeing as how this is exactly what I did, I can speak from experience. When I submitted my seed phrase to the fake dApp (thinking I was connecting), I essentially gave them the keys to the car. The scammers then used it to access my account and transfer out all of my ETH.

## Wallets and accounts

Accounts on the blockchain each have their own unique address and are comprised of a cryptographic keypair. Software wallets like MetaMask and Rainbow allow users to interact with their blockchain accounts and authorize transactions.

For each account, a private key is created that is then used to generate an associated public key. The account address is then derived from the public key and acts as an identifier for the account.

Just remember accounts and addresses **are not** the same thing.

## Custodial vs. non-custodial wallets

Accounts are comprised of a public/private keypair, the latter of which needs to be kept secret. Who bears that responsibility is what differentiates custodial and non-custodial wallets.

With a custodial wallet like Coinbase (or any other centralized exchange), that company both creates the blockchain account on your behalf _and_ manages the associated keys. While this makes things easier on you, it means you are trusting a third party to store your credentials and act as a "custodian" of your account.

On the flip-side, with non-custodial wallets _you_ need to manage the public/private keys yourself. This gives you full ownership over the account but comes at the price of additional responsibility. If you lose the private key or seed phrase, **you will not be able to access your assets**. The blockchain is a decentralized network and no centralized party can recover them for you.

## Hardware wallets

Since the account's private key is used to sign transactions (i.e. authorizing purchases, asset transfers, etc.), keeping it safe is the name of the game.

For mobile and browser wallets, the keys are stored on the software's host device. This helps with user experience because the software can easily retrieve the private key when needed to sign a transaction. However, this also adds an attack vector as the keys are being stored on an internet enabled device.

Hardware wallets take a different approach and store your private key on a **completely separate device** like a USB drive. Often, they're airgapped and do not have any internet, Bluetooth or NFC connection to make them more secure. Each has an authentication mechanism (like scanning a QR code) that allows you to fetch the private key via a mobile app in order to sign transactions. Because of this extra step, an attacker would need to gain access to both your phone and hardware wallet in order to make malicious transactions.

## Bonus: How I got hacked a second time

One of the most widely used web3 wallets is MetaMask. Within the wallet, you can create multiple accounts each with their own unique address. While they may seem fully isolated, **they are not**.

Behind the scenes, MetaMask uses **the same seed phrase and private key** to generate new public keys and address for each account it manages. At the time, I did not know this so when I moved funds from Account 1 to Account 2 in MetaMask, I didn't realize the hacker would have access to that too.

As if the gas fees weren't bad enough 😅

## Pro-tips

1. **Use a burner**
   When interacting with a dApp for something like minting a NFT, use a secondary wallet/account. Keep your primary assets in an account you keep separate, preferably a hardware wallet. This way, if a malicious app gains access to your wallet you don't have to worry about your main holdings.

2. **Consider a contract wallet**
   Wallets like Argent manage your assets in a smart contract, not a "normal" blockchain account. This allows for them to build additional functionality like multi-factor authentication for signing transactions via text and/or email, as well as recovery options for when you lose your seed phrase. This can be **huge** as many seed phrase-less folks can testify.

## Have fun, be safe

A large part of understanding web3 is learning via participation. As in, the more projects/protocols you use and interact with, the more you will understand the ecosystem and underlying concepts.

This, of course, requires you to have a crypto wallet, connect to dApps, and interact with smart contracts, all of which can be somewhat risky as the space is still very new. But don't let this stop you from exploring: just make sure to take the proper precautions!

After that, it'll be all about the vibes 😎
