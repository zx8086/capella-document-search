import { writable } from 'svelte/store';

interface Quote {
    text: string;
}

const defaultQuotes: Quote[] = [
    { text: 'Prove by Doing !' },
    { text: 'First make it Work, then make it Better, then make it Beautiful !' },
    { text: 'It\'s not possible ! - "No, it is necessary !" No Time For Caution !' },
    { text: '#TEGID - The Enemy\'s Gate Is Down !' },
    { text: 'De-coupled & Agnostic !' },
    { text: 'We Build it, We Support it !' },
    { text: 'The way you do Anything, is the way you do Everything !' },
];

export const quotes = writable<Quote[]>(defaultQuotes);