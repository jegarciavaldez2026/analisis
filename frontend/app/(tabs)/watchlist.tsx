/**
 * Favoritos — lo que sigues sin haber comprado.
 *
 * La pantalla real vive en `components/AccountWorkspace`, que Favoritos y
 * Portafolio comparten. Aquí sólo se declara cuál de las dos lecturas es ésta.
 */
import React from 'react';
import AccountWorkspace from '../../components/AccountWorkspace';

export default function WatchlistScreen() {
  return <AccountWorkspace seccion="watchlist" />;
}
