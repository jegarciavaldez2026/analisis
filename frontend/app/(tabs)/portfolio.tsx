/**
 * Portafolio — lo que tienes de verdad, con su coste y su resultado.
 *
 * La pantalla real vive en `components/AccountWorkspace`, que Favoritos y
 * Portafolio comparten. Aquí sólo se declara cuál de las dos lecturas es ésta.
 */
import React from 'react';
import AccountWorkspace from '../../components/AccountWorkspace';

export default function PortfolioScreen() {
  return <AccountWorkspace seccion="portfolio" />;
}
