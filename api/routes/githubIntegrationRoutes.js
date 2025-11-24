import express from 'express';
import { 
  authorize, 
  callback, 
  checkConnection,
  createRepo,
  disconnect 
} from '../controllers/githubOAuthController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// OAuth Flow
router.get('/oauth/authorize', authMiddleware, authorize);
router.get('/oauth/callback', callback); // Não usa authMiddleware porque vem do GitHub

// Verificar conexão
router.get('/check-connection', authMiddleware, checkConnection);

// Criar repositório (aceita OAuth ou token manual)
router.post('/create-repo', authMiddleware, createRepo);

// Desconectar (opcional)
router.delete('/disconnect', authMiddleware, disconnect);

export default router;
