import * as assert from "assert";
import * as anchor from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { Program } from '@project-serum/anchor';
import { NftBreed } from '../target/types/nft_breed';
import * as utils from "./utils";

describe('nft-breed', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NftBreed as Program<NftBreed>;
  const provider = anchor.Provider.env();

  let feeMint, feeMintObject, feeTokenPoolVault;
  let poolKeypair = anchor.web3.Keypair.generate();
  let user1 = anchor.web3.Keypair.generate();
  let user2 = anchor.web3.Keypair.generate();
  let user1FeeAccount, user2FeeAccount;
  let child1, child2, child1A, child2A;
  let father1, father2, father1A, father2A;
  let mother1, mother2, mother1A, mother2A;

  it('initialized mint!', async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    await utils.sendLamports(provider, user1.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    await utils.sendLamports(provider, user2.publicKey, anchor.web3.LAMPORTS_PER_SOL);

    feeMint = await utils.createMint(provider, 9);
    feeMintObject = new Token(provider.connection, feeMint.publicKey, TOKEN_PROGRAM_ID, provider.wallet.payer);

    user1FeeAccount = await feeMintObject.createAssociatedTokenAccount(user1.publicKey);
    await feeMintObject.mintTo(user1FeeAccount, provider.wallet.payer, [], anchor.web3.LAMPORTS_PER_SOL * 1000);

    user2FeeAccount = await feeMintObject.createAssociatedTokenAccount(user2.publicKey);
    await feeMintObject.mintTo(user2FeeAccount, provider.wallet.payer, [], anchor.web3.LAMPORTS_PER_SOL * 1000);
  });


  it('Is initialized!', async () => {
    const [
          _poolSigner,
          _nonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
          [poolKeypair.publicKey.toBuffer()],
          program.programId
      );
      let poolSigner = _poolSigner;
      let poolNonce = _nonce;

      feeTokenPoolVault = await feeMintObject.createAccount(poolSigner);

      await program.rpc.initialize(
          poolNonce,
          new anchor.BN(anchor.web3.LAMPORTS_PER_SOL),
          {
              accounts: {
                  authority: provider.wallet.publicKey,
                  breedFeeTokenVault: feeTokenPoolVault,
                  breedFeeTokenMint: feeMint.publicKey,
                  breedSigner: poolSigner,
                  breed: poolKeypair.publicKey,
                  tokenProgram: TOKEN_PROGRAM_ID,
                  systemProgram: anchor.web3.SystemProgram.programId,
              },
              signers: [poolKeypair],
              instructions: [
                  await program.account.breed.createInstruction(poolKeypair, ),
              ],
          }
      );
  });

  it('Nft mint', async () => {
    const [
          poolSigner,
          _nonce,
      ] = await anchor.web3.PublicKey.findProgramAddress(
          [poolKeypair.publicKey.toBuffer()],
          program.programId
      );

    let userProvider = utils.getProvider(user1);
    const n1 = await utils.createNFT(userProvider, user1.publicKey)
    father1 = n1.mint;
    father1A = n1.nftAccount;
    
    const n2 = await utils.createNFT(userProvider, user1.publicKey)
    mother1 = n2.mint;
    mother1A = n2.nftAccount;

    const n3 = await utils.createNFT(provider, provider.wallet.publicKey)
    child1 = new Token(provider.connection, n3.mint, TOKEN_PROGRAM_ID, provider.wallet.payer);
    let _child1A = n3.nftAccount;

    child1A = await child1.createAccount(poolSigner);
    await nftTransfer(_child1A, child1A, provider);
    
    userProvider = utils.getProvider(user2);
    const n4 = await utils.createNFT(userProvider, user2.publicKey)
    father2 = n4.mint;
    father2A = n4.nftAccount;
    
    const n5 = await utils.createNFT(userProvider, user2.publicKey)
    mother2 = n5.mint;
    mother2A = n5.nftAccount;
    
    const n6 = await utils.createNFT(provider, provider.wallet.publicKey)
    child2 = new Token(provider.connection, n6.mint, TOKEN_PROGRAM_ID, provider.wallet.payer);
    const _child2A = n6.nftAccount;

    const child2A = await child2.createAccount(poolSigner);
    await nftTransfer(_child2A, child2A, provider);
  })

  it('Breeding', async () => {
        let userProvider = utils.getProvider(user1);
        let userProgram = new anchor.Program(program.idl, program.programId, userProvider);

    let poolObject = await userProgram.account.breed.fetch(poolKeypair.publicKey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            userProgram.programId
        );
        let poolSigner = _poolSigner;

        const [
          family1,
          nonce1
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [father1.toBuffer(), poolKeypair.publicKey.toBuffer()],
            userProgram.programId
        )

        const [
          family2,
          nonce2
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [mother1.toBuffer(), poolKeypair.publicKey.toBuffer()],
            userProgram.programId
        )

        const [
          family3,
          nonce3
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [child1.publicKey.toBuffer(), poolKeypair.publicKey.toBuffer()],
            userProgram.programId
        )

        let childMint = new Token(userProvider.connection, child1.publicKey, TOKEN_PROGRAM_ID, userProvider.wallet.payer);
        let childReceiver = await childMint.getOrCreateAssociatedAccountInfo(user1.publicKey);

        console.log(poolSigner.toBase58())
        console.log(child1A.toBase58())
        console.log(childReceiver.address.toBase58())
        console.log(poolKeypair.publicKey.toBase58())
        console.log(user1.publicKey.toBase58())
        await userProgram.rpc.createChild(nonce1, nonce2, nonce3,
            {
                accounts: {
                    breed: poolKeypair.publicKey,
                    feeDepositor: user1FeeAccount,
                    breedFeeTokenVault: feeTokenPoolVault,
                    nft1: father1,
                    nft2: mother1,
                    family1: family1,
                    family2: family2,
                    family3: family3,
                    child: child1A,
                    childReceiver: childReceiver.address,
                    breedSigner: poolSigner,
                    owner: user1.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
            }
        );
  })
});

async function nftTransfer(from, to, provider) {
  console.log(from.toBase58())
  console.log(to.toBase58())

  let instructions: anchor.web3.TransactionInstruction[] = [];  
  instructions.push(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from,
      to,
      provider.wallet.publicKey,
      [],
      1
    )
  );

  const transaction = new anchor.web3.Transaction().add(...instructions);
  var signature = await anchor.web3.sendAndConfirmTransaction(
    provider.connection,
    transaction,
    [provider.wallet.payer]
  );
}