import { Component, h } from '@monygroupcorp/microact';

class WhitepaperPage extends Component {
  render() {
    return h('div', { className: 'whitepaper-page' },
      h('div', { className: 'whitepaper-container' },

        // Back link
        h('a', { className: 'whitepaper-back', href: '#' }, '\u2190 Back'),

        // Header
        h('header', { className: 'whitepaper-header' },
          h('div', { className: 'whitepaper-brand' }, 'CAMEL'),
          h('div', { className: 'art-deco-divider' },
            h('div', { className: 'ornament' })
          ),
          h('h1', { className: 'whitepaper-title' }, 'Whitepaper'),
          h('p', { className: 'whitepaper-version' }, 'v1.0 \u2014 February 2026')
        ),

        // Table of Contents
        h('nav', { className: 'whitepaper-toc' },
          h('h2', { className: 'whitepaper-section-title' }, 'Contents'),
          h('ol', { className: 'toc-list' },
            h('li', null, h('a', { href: '#wp-introduction' }, 'Introduction')),
            h('li', null, h('a', { href: '#wp-cypher' }, 'Cypher Protocol')),
            h('li', null, h('a', { href: '#wp-token' }, 'Token Design')),
            h('li', null, h('a', { href: '#wp-distribution' }, 'Distribution')),
            h('li', null, h('a', { href: '#wp-liquidity' }, 'Protocol-Owned Liquidity')),
            h('li', null, h('a', { href: '#wp-staking' }, 'Staking')),
            h('li', null, h('a', { href: '#wp-protection' }, 'Launch Protection')),
            h('li', null, h('a', { href: '#wp-governance' }, 'Governance & The Path Forward'))
          )
        ),

        // Section 1: Introduction
        h('section', { className: 'whitepaper-section', id: 'wp-introduction' },
          h('h2', { className: 'whitepaper-section-title' }, 'I. Introduction'),
          h('p', null,
            'CAMEL is a commemorative collectible celebrating the launch of Cypher Protocol \u2014 Ethereum\u2019s community-owned capital markets infrastructure.'
          ),
          h('p', null,
            'There are no VCs. No private investors. No pre-sales. CAMEL exists as a free mint for the communities that stood alongside Cypher from the beginning, and as a permanent mechanism for building protocol-owned liquidity that benefits holders forever.'
          ),
          h('p', null,
            'Every trade generates fees. Those fees are collected, reinvested, and compounded into deeper and deeper liquidity positions. Over time, these positions grow large enough to generate sustainable yield \u2014 which is returned to stakers. The result is a self-reinforcing flywheel: more liquidity means tighter spreads, more volume, more fees, and more liquidity.'
          )
        ),

        // Section 2: Cypher Protocol
        h('section', { className: 'whitepaper-section', id: 'wp-cypher' },
          h('h2', { className: 'whitepaper-section-title' }, 'II. Cypher Protocol'),
          h('p', null,
            'Cypher is community-owned capital markets infrastructure built on Ethereum. It provides the decentralized exchange layer that CAMEL trades on, powered by concentrated liquidity and automated market making.'
          ),
          h('p', null,
            'CAMEL is deeply integrated with Cypher. All trading happens through Cypher\u2019s DEX, fees are collected through Cypher\u2019s pool infrastructure, and liquidity positions are managed through Cypher\u2019s position manager. CAMEL doesn\u2019t just use Cypher \u2014 it showcases what\u2019s possible when a token is purpose-built for Cypher\u2019s architecture.'
          ),
          h('div', { className: 'whitepaper-callout' },
            h('p', null,
              'Learn more at ',
              h('a', { href: 'https://app.cyphereth.com/', target: '_blank', rel: 'noopener' }, 'app.cyphereth.com')
            )
          )
        ),

        // Section 3: Token Design
        h('section', { className: 'whitepaper-section', id: 'wp-token' },
          h('h2', { className: 'whitepaper-section-title' }, 'III. Token Design'),
          h('p', null,
            'CAMEL is built on the DN404 standard \u2014 a dual-nature token that is simultaneously an ERC-20 fungible token and an ERC-721 NFT. This means CAMEL can be traded on decentralized exchanges like any token, while also functioning as a collectible.'
          ),
          h('h3', { className: 'whitepaper-subsection-title' }, 'The 1,000,000 Threshold'),
          h('p', null,
            'Every 1,000,000 CAMEL tokens in a wallet automatically materializes as a unique NFT. If a holder acquires 3,000,000 tokens, they hold 3 NFTs. Sell below the threshold and the NFT burns. Buy back above it and a new one appears. The token and the art are one.'
          ),
          h('h3', { className: 'whitepaper-subsection-title' }, 'Balance Mint & Reroll'),
          h('p', null,
            'Holders can use balance mint to materialize NFTs from their existing token balance, and reroll to regenerate NFT traits on pieces they already own. A small 0.01% convenience fee applies to rerolls, which stays in the contract treasury.'
          )
        ),

        // Section 4: Distribution
        h('section', { className: 'whitepaper-section', id: 'wp-distribution' },
          h('h2', { className: 'whitepaper-section-title' }, 'IV. Distribution'),
          h('p', null,
            'CAMEL has a straightforward distribution:'
          ),
          h('div', { className: 'whitepaper-distribution' },
            h('div', { className: 'distribution-item' },
              h('div', { className: 'distribution-percent' }, '60%'),
              h('div', { className: 'distribution-label' }, 'Liquidity Pool'),
              h('p', { className: 'distribution-desc' },
                'Deployed as one-sided liquidity on Cypher DEX. This creates the initial trading market and becomes the foundation for protocol-owned liquidity.'
              )
            ),
            h('div', { className: 'distribution-item' },
              h('div', { className: 'distribution-percent' }, '30%'),
              h('div', { className: 'distribution-label' }, 'Free Community Mint'),
              h('p', { className: 'distribution-desc' },
                'Reserved for whitelisted community members. No cost to claim \u2014 just connect and mint.'
              )
            ),
            h('div', { className: 'distribution-item' },
              h('div', { className: 'distribution-percent' }, '10%'),
              h('div', { className: 'distribution-label' }, 'Team Reserve'),
              h('p', { className: 'distribution-desc' },
                'Allocated to the team for ongoing development, operations, and long-term alignment with the project.'
              )
            )
          ),
          h('h3', { className: 'whitepaper-subsection-title' }, 'Eligible Communities'),
          h('p', null,
            'The free mint is open to holders and participants from communities that supported Cypher\u2019s vision from the start:'
          ),
          h('ul', { className: 'whitepaper-list' },
            h('li', null, 'Milady holders'),
            h('li', null, 'Remilio holders'),
            h('li', null, 'Cypher cyphO stakers')
          ),
          h('p', null,
            'Whitelist verification is done on-chain using Merkle proofs. Each eligible address can claim once.'
          )
        ),

        // Section 5: Protocol-Owned Liquidity
        h('section', { className: 'whitepaper-section', id: 'wp-liquidity' },
          h('h2', { className: 'whitepaper-section-title' }, 'V. Protocol-Owned Liquidity'),
          h('p', null,
            'The core innovation of CAMEL is its automated, protocol-owned liquidity engine. Rather than relying on mercenary liquidity providers who can withdraw at any moment, CAMEL builds permanent liquidity that belongs to the community.'
          ),
          h('h3', { className: 'whitepaper-subsection-title' }, 'How It Works'),
          h('p', null,
            'Every trade on the CAMEL/WETH pool generates fees. These fees are collected by the LiquidityManager contract and processed according to a configurable investment schedule:'
          ),
          h('ol', { className: 'whitepaper-list whitepaper-list-numbered' },
            h('li', null, h('strong', null, 'Fee Collection'), ' \u2014 Trading fees accumulate in the liquidity positions. The LiquidityManager periodically collects these fees.'),
            h('li', null, h('strong', null, 'Beneficiary Split'), ' \u2014 A small percentage (1%) goes to the artist and developer as compensation. The rest is reinvested.'),
            h('li', null, h('strong', null, 'Reinvestment'), ' \u2014 The remaining fees are converted and added back as liquidity, deepening the pool and tightening spreads.'),
            h('li', null, h('strong', null, 'Compounding'), ' \u2014 Deeper liquidity attracts more volume, which generates more fees, which builds more liquidity. The flywheel spins.')
          ),
          h('h3', { className: 'whitepaper-subsection-title' }, 'The Long-Term Strategy'),
          h('p', null,
            'In the early days, all reinvestment is focused on the CAMEL/WETH pool itself \u2014 building a deeper position in the token\u2019s own market. As this position matures and volume naturally stabilizes, the investment schedule shifts: fees are directed toward higher-yield pools on Cypher to generate continuous returns.'
          ),
          h('p', null,
            'Over time, these external positions grow into a substantial portfolio of protocol-owned liquidity, generating yield across multiple markets. This yield eventually flows back to CAMEL stakers.'
          )
        ),

        // Section 6: Staking
        h('section', { className: 'whitepaper-section', id: 'wp-staking' },
          h('h2', { className: 'whitepaper-section-title' }, 'VI. Staking'),
          h('p', null,
            'CAMEL holders can stake their tokens to earn a share of the protocol\u2019s fee revenue. Staking is a simple, on-chain mechanism \u2014 no lock-ups, no complex vesting.'
          ),
          h('h3', { className: 'whitepaper-subsection-title' }, 'When Staking Activates'),
          h('p', null,
            'Staking is not enabled at launch. It activates once the protocol-owned liquidity positions have grown large enough to generate meaningful, sustainable APR for stakers. Turning on staking too early would dilute rewards before they\u2019re worth claiming.'
          ),
          h('p', null,
            'The activation timeline follows a deliberate sequence:'
          ),
          h('ol', { className: 'whitepaper-list whitepaper-list-numbered' },
            h('li', null, h('strong', null, 'Launch'), ' \u2014 Initial volume and trading fees are captured and reinvested into the CAMEL/WETH pool.'),
            h('li', null, h('strong', null, 'Deepening'), ' \u2014 Protocol-owned liquidity grows. The position in the CAMEL market becomes substantial.'),
            h('li', null, h('strong', null, 'Expansion'), ' \u2014 Investment schedule pivots to external high-yield pools on Cypher, building a diversified yield-generating portfolio.'),
            h('li', null, h('strong', null, 'Staking Activation'), ' \u2014 Once external positions generate attractive returns, staking is enabled. The announcement drives volume, generating fees that are captured and reinvested.'),
            h('li', null, h('strong', null, 'Steady State'), ' \u2014 Continuous yield from the portfolio flows to stakers. The protocol is self-sustaining.')
          ),
          h('h3', { className: 'whitepaper-subsection-title' }, 'How Rewards Work'),
          h('p', null,
            'When staking is active, fees are split proportionally between stakers and the protocol treasury based on the ratio of staked tokens to total supply. Stakers earn their share in ETH, claimable at any time. The protocol\u2019s share continues to compound into deeper liquidity.'
          )
        ),

        // Section 7: Launch Protection
        h('section', { className: 'whitepaper-section', id: 'wp-protection' },
          h('h2', { className: 'whitepaper-section-title' }, 'VII. Launch Protection'),
          h('p', null,
            'CAMEL includes a sniper tax mechanism to protect the community during the critical launch window. The tax starts high and decays linearly to zero over a configured period.'
          ),
          h('p', null,
            'This ensures that bots and snipers who attempt to front-run the launch pay a premium that goes directly to the contract treasury \u2014 ultimately benefiting legitimate holders through deeper liquidity. After the decay period ends, all trades are tax-free forever.'
          ),
          h('p', null,
            'The contract itself, the LiquidityManager, and whitelisted addresses are exempt from the sniper tax.'
          )
        ),

        // Section 8: Governance & Future
        h('section', { className: 'whitepaper-section', id: 'wp-governance' },
          h('h2', { className: 'whitepaper-section-title' }, 'VIII. Governance & The Path Forward'),
          h('p', null,
            'CAMEL is built with role-based access control. The owner can grant and revoke specific roles \u2014 metadata management, liquidity operations, artist and developer addresses \u2014 independently. This architecture is designed to support a gradual transition toward community governance.'
          ),
          h('p', null,
            'Metadata can be permanently locked once the art is finalized, ensuring the NFT collection is immutable even if governance structures change. Liquidity management roles can be transitioned to a multisig or DAO as the community matures.'
          ),
          h('p', null,
            'The vision is a protocol that runs itself: automated fee collection, automated reinvestment, automated staking rewards. The Camel Cabal \u2014 the community of CAMEL holders and stakers \u2014 collectively controls a growing portfolio of protocol-owned liquidity that generates lifetime yield.'
          ),
          h('div', { className: 'whitepaper-callout whitepaper-callout-final' },
            h('p', null,
              'No VCs. No private investors. Built for Ethereum. Owned by the community.'
            )
          )
        ),

        // Footer
        h('footer', { className: 'whitepaper-footer' },
          h('div', { className: 'art-deco-divider' },
            h('div', { className: 'ornament' })
          ),
          h('div', { className: 'whitepaper-footer-links' },
            h('a', { href: '#', className: 'footer-link' }, 'Home'),
            h('a', { href: 'https://app.cyphereth.com/', target: '_blank', rel: 'noopener', className: 'footer-link' }, 'Cypher'),
            h('a', { href: 'https://x.com/cypher_ethereum', target: '_blank', rel: 'noopener', className: 'footer-link' }, 'X')
          ),
          h('p', { className: 'whitepaper-footer-copy' }, 'CAMEL \u2014 A Cypher Protocol Collectible')
        )
      )
    );
  }
}

export default WhitepaperPage;
