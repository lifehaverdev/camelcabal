import { MerkleTree } from 'merkletreejs';
import { ethers } from 'ethers';
import camelData from '../data/camel.json';

const whitelist = camelData.addresses;

// Hash function matching Solidity: keccak256(abi.encodePacked(bytes20(address)))
const hashAddress = (address) => {
  return ethers.utils.solidityKeccak256(['address'], [address]);
};

// Build tree once on import
const leaves = whitelist.map(addr => hashAddress(addr));
const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sort: true });

export const getMerkleRoot = () => tree.getHexRoot();

export const getMerkleProof = (address) => {
  const leaf = hashAddress(address);
  return tree.getHexProof(leaf);
};

export const isWhitelisted = (address) => {
  return whitelist.some(a => a.toLowerCase() === address.toLowerCase());
};
