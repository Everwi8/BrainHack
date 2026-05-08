import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

// GET all items from an example table
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('example').select('*');
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST create a new item
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('example')
      .insert(req.body)
      .select()
      .single();
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
