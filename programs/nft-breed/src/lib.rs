use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Token, Mint};

declare_id!("5RYcKgfCqf2N2yAp1HTu2k3URtmNxwkwjgVeULtKdRoU");

#[program]
pub mod nft_breed {
    use super::*;
    pub fn initialize(
                        ctx: Context<Initialize>,
                        nonce: u8,
                        fee_amount: u64,
                        ) -> ProgramResult {

        let breed = &mut ctx.accounts.breed;

        breed.authority = ctx.accounts.authority.key();
        breed.breed_fee_token_mint = ctx.accounts.breed_fee_token_mint.key();
        breed.breed_fee_token_vault = ctx.accounts.breed_fee_token_vault.key();
        breed.fee_amount = fee_amount;
        breed.nonce = nonce;
        Ok(())
    }

    pub fn create_child(
                ctx: Context<CreateChild>, 
                f1_nonce: u8,
                f2_nonce: u8,
                f3_nonce: u8,
            ) -> ProgramResult {
        let breed = &mut ctx.accounts.breed;
        if ctx.accounts.fee_depositor.amount < breed.fee_amount {
            return Err(ErrorCode::FeeNotEnough.into());
        }

        let family1 = &mut ctx.accounts.family1;
        family1.father = ctx.accounts.nft1.key();
        family1.mother = ctx.accounts.nft2.key();
        family1.child = ctx.accounts.child.mint;
        family1.nonce = f1_nonce;

        let family2 = &mut ctx.accounts.family2;
        family2.father = ctx.accounts.nft1.key();
        family2.mother = ctx.accounts.nft2.key();
        family2.child = ctx.accounts.child.mint;
        family2.nonce = f2_nonce;
        
        let family3 = &mut ctx.accounts.family3;
        family3.father = ctx.accounts.nft1.key();
        family3.mother = ctx.accounts.nft2.key();
        family3.child = ctx.accounts.child.mint;
        family3.nonce = f3_nonce;

        // breed fee pay
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.fee_depositor.to_account_info(),
                to: ctx.accounts.breed_fee_token_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, breed.fee_amount)?;

        let seeds = &[
            breed.to_account_info().key.as_ref(),
            &[breed.nonce],
        ];
        let breed_signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.child.to_account_info(),
                to: ctx.accounts.child_receiver.to_account_info(),
                authority: ctx.accounts.breed_signer.to_account_info(),
            },
            breed_signer,
        );
        token::transfer(cpi_ctx, 1 as u64)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct Initialize<'info> {
    /// CHECK: This is pool authority. This account has not any data.
    authority: UncheckedAccount<'info>,
    breed_fee_token_mint: Box<Account<'info, Mint>>,
    #[account(
        constraint = breed_fee_token_vault.mint == breed_fee_token_mint.key(),
        constraint = breed_fee_token_vault.owner == breed_signer.key(),
    )]
    breed_fee_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        seeds = [
            breed.to_account_info().key.as_ref()
        ],
        bump,
    )]
    /// CHECK: This is breed contract signer
    breed_signer: UncheckedAccount<'info>,
    #[account(
        zero,
    )]
    breed: Box<Account<'info, Breed>>,
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(f1_nonce: u8, f2_nonce: u8, f3_nonce: u8)]
pub struct CreateChild<'info> {
    #[account(mut)]
    breed: Box<Account<'info, Breed>>,
    #[account(
        mut,
        constraint = fee_depositor.mint == breed.breed_fee_token_mint
    )]
    fee_depositor: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = breed_fee_token_vault.mint == breed.breed_fee_token_mint,
        constraint = breed_fee_token_vault.owner == breed_signer.key(),
    )]
    breed_fee_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    nft1: Box<Account<'info, Mint>>,
    #[account(mut)]
    nft2: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = owner,
        seeds = [
            nft1.key().as_ref(), 
            breed.to_account_info().key.as_ref()
        ],
        bump,
    )]
    family1: Box<Account<'info, Family>>,
    #[account(
        init,
        payer = owner,
        seeds = [
            nft2.key().as_ref(), 
            breed.to_account_info().key.as_ref()
        ],
        bump,
    )]
    family2: Box<Account<'info, Family>>,
    #[account(
        init,
        payer = owner,
        seeds = [
            child.mint.as_ref(), 
            breed.to_account_info().key.as_ref()
        ],
        bump,
    )]
    family3: Box<Account<'info, Family>>,
    #[account(
        mut,
        constraint = child.owner == *breed_signer.key,
    )]
    child: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = child_receiver.owner == *owner.key,
    )]
    child_receiver: Box<Account<'info, TokenAccount>>,
    // Program signers.
    #[account(
        seeds = [
            breed.to_account_info().key.as_ref()
        ],
        bump = breed.nonce,
    )]
    /// CHECK: This is breed contract signer
    breed_signer: UncheckedAccount<'info>,
    #[account(mut)]
    owner: Signer<'info>,
    // Misc.
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[account]
pub struct Breed {
    authority: Pubkey,
    breed_fee_token_mint: Pubkey,
    breed_fee_token_vault: Pubkey,
    fee_amount: u64,
    nonce: u8,
}

#[account]
#[derive(Default)]
pub struct Family {
    father: Pubkey,
    mother: Pubkey,
    child: Pubkey,
    owner: Pubkey,
    nonce: u8,
}

#[error]
pub enum ErrorCode {
    #[msg("Used already breed nft.")]
    UsedAlreadyBreed,
    #[msg("Breed fee is not enough.")]
    FeeNotEnough,
}
