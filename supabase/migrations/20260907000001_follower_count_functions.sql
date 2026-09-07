-- Create RPC functions to safely update follower counts
CREATE OR REPLACE FUNCTION increment_follower_count(artist_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE artists
  SET follower_count = follower_count + 1
  WHERE id = artist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_follower_count(artist_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE artists
  SET follower_count = GREATEST(0, follower_count - 1)
  WHERE id = artist_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION increment_follower_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_follower_count(uuid) TO authenticated;
