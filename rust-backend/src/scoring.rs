use std::cmp::Ordering;
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub struct TeamScore {
    pub team_id: String,
    pub score: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TeamPoints {
    pub team_id: String,
    pub points: f64,
}

/// Average two positive times, rounded to three decimal places as in Math.round.
pub fn calculate_chug_average(chug1: f64, chug2: f64) -> Result<f64, &'static str> {
    if chug1 <= 0.0 || chug2 <= 0.0 {
        return Err("Chug times must be positive numbers");
    }
    let scaled = (chug1 + chug2) / 2.0 * 1000.0;
    // Math.round rounds ties toward positive infinity, unlike f64::round.
    // Avoid adding 0.5, which can itself round up just below a half.
    let rounded = if scaled.is_finite() && scaled.fract() >= 0.5 {
        scaled.floor() + 1.0
    } else {
        scaled.floor()
    };
    Ok(rounded / 1000.0)
}

/// Sum the largest three positive fish weights; an absent catch scores zero.
pub fn calculate_top3_fish_total(weights: &[f64]) -> f64 {
    let mut top = [0.0; 3];
    for &weight in weights {
        if weight > top[0] {
            top[2] = top[1];
            top[1] = top[0];
            top[0] = weight;
        } else if weight > top[1] {
            top[2] = top[1];
            top[1] = weight;
        } else if weight > top[2] {
            top[2] = weight;
        }
    }
    top[0] + top[1] + top[2]
}

// Rank one receives seven points; rank seven and every subsequent rank receive one.
fn rank_points(rank: usize) -> f64 {
    8usize.saturating_sub(rank).max(1) as f64
}

fn for_each_points<T>(ranked: &[T], score: impl Fn(&T) -> f64, mut assign: impl FnMut(&T, f64)) {
    let mut start = 0;
    while start < ranked.len() {
        let current = score(&ranked[start]);
        let mut end = start + 1;
        while end < ranked.len() && score(&ranked[end]) == current {
            end += 1;
        }
        let total: f64 = (start + 1..=end).map(rank_points).sum();
        let points = total / (end - start) as f64;
        for team in &ranked[start..end] {
            assign(team, points);
        }
        start = end;
    }
}

/// Award points to teams already sorted best to worst, averaging tied ranks.
pub fn calculate_points_with_tiebreaking(ranked_teams: &[TeamScore]) -> Vec<TeamPoints> {
    let mut result = Vec::with_capacity(ranked_teams.len());
    for_each_points(
        ranked_teams,
        |team| team.score,
        |team, points| {
            result.push(TeamPoints {
                team_id: team.team_id.clone(),
                points,
            });
        },
    );
    result
}

pub(crate) fn rank_teams<K: Eq + std::hash::Hash + Clone>(
    scores: &HashMap<K, f64>,
    higher_is_better: bool,
) -> HashMap<K, f64> {
    let mut ranked: Vec<_> = scores.iter().collect();
    ranked.sort_by(|a, b| {
        // JavaScript's numeric sort treats a NaN comparison as equality.
        let difference = if higher_is_better {
            *b.1 - *a.1
        } else {
            *a.1 - *b.1
        };
        difference.partial_cmp(&0.0).unwrap_or(Ordering::Equal)
    });
    let mut result = HashMap::with_capacity(ranked.len());
    for_each_points(
        &ranked,
        |team| *team.1,
        |team, points| {
            result.insert(team.0.clone(), points);
        },
    );
    result
}

pub fn rank_fish_teams(scores: &HashMap<String, f64>) -> HashMap<String, f64> {
    rank_teams(scores, true)
}

pub fn rank_chug_teams(scores: &HashMap<String, f64>) -> HashMap<String, f64> {
    rank_teams(scores, false)
}

pub fn rank_golf_teams(scores: &HashMap<String, f64>) -> HashMap<String, f64> {
    rank_teams(scores, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scores(values: &[(&str, f64)]) -> HashMap<String, f64> {
        values
            .iter()
            .map(|(id, score)| ((*id).to_owned(), *score))
            .collect()
    }

    #[test]
    fn chug_average_rounding_and_validation() {
        assert_eq!(calculate_chug_average(10.123, 20.456), Ok(15.29));
        assert_eq!(calculate_chug_average(1.111, 2.222), Ok(1.667));
        assert_eq!(calculate_chug_average(0.1, 0.2), Ok(0.15));
        assert_eq!(
            calculate_chug_average(0.0, 1.0),
            Err("Chug times must be positive numbers")
        );
        assert!(calculate_chug_average(1.0, -1.0).is_err());
        assert!(calculate_chug_average(f64::NAN, 1.0).unwrap().is_nan());
    }

    #[test]
    fn fish_top_three_ignore_nonpositive_and_nan() {
        assert_eq!(calculate_top3_fish_total(&[]), 0.0);
        assert_eq!(calculate_top3_fish_total(&[0.0, -1.0, f64::NAN]), 0.0);
        assert_eq!(calculate_top3_fish_total(&[10.25, 20.75]), 31.0);
        assert_eq!(calculate_top3_fish_total(&[1.5, 2.5, 3.5, 4.5]), 10.5);
        assert_eq!(calculate_top3_fish_total(&[5.0, 5.0, 5.0, 5.0]), 15.0);
    }

    #[test]
    fn ties_split_rank_points_and_consume_positions() {
        let teams: Vec<_> = [100.0, 100.0, 80.0, 70.0, 70.0]
            .iter()
            .enumerate()
            .map(|(i, score)| TeamScore {
                team_id: i.to_string(),
                score: *score,
            })
            .collect();
        let result = calculate_points_with_tiebreaking(&teams);
        assert_eq!(
            result.iter().map(|p| p.points).collect::<Vec<_>>(),
            vec![6.5, 6.5, 5.0, 3.5, 3.5]
        );
        assert_eq!(
            result
                .iter()
                .map(|p| p.team_id.as_str())
                .collect::<Vec<_>>(),
            vec!["0", "1", "2", "3", "4"]
        );
        assert!(calculate_points_with_tiebreaking(&[]).is_empty());
    }

    #[test]
    fn ties_at_and_beyond_minimum_rank() {
        let teams: Vec<_> = (0..20)
            .map(|i| TeamScore {
                team_id: i.to_string(),
                score: if i >= 5 { 0.0 } else { (20 - i) as f64 },
            })
            .collect();
        let result = calculate_points_with_tiebreaking(&teams);
        assert_eq!(result[4].points, 3.0);
        assert_eq!(result[5].points, 16.0 / 15.0);
        assert_eq!(result[19].points, 16.0 / 15.0);
    }

    #[test]
    fn event_rank_direction_and_ties() {
        let input = scores(&[("a", 10.0), ("b", 20.0), ("c", 20.0), ("d", 30.0)]);
        assert_eq!(
            rank_fish_teams(&input),
            scores(&[("d", 7.0), ("b", 5.5), ("c", 5.5), ("a", 4.0)])
        );
        let expected = scores(&[("a", 7.0), ("b", 5.5), ("c", 5.5), ("d", 4.0)]);
        assert_eq!(rank_chug_teams(&input), expected);
        assert_eq!(rank_golf_teams(&input), expected);
        assert!(rank_fish_teams(&HashMap::new()).is_empty());
        assert_eq!(rank_golf_teams(&scores(&[("only", 0.0)]))["only"], 7.0);
    }

    #[test]
    fn shared_language_neutral_fixtures() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/scoring.json")).unwrap();
        let numbers = |value: &serde_json::Value| -> Vec<f64> {
            value
                .as_array()
                .unwrap()
                .iter()
                .map(|n| n.as_f64().unwrap())
                .collect()
        };
        for fixture in fixtures["fishTotals"].as_array().unwrap() {
            assert_eq!(
                calculate_top3_fish_total(&numbers(&fixture["weights"])),
                fixture["expected"].as_f64().unwrap()
            );
        }
        for fixture in fixtures["chugAverages"].as_array().unwrap() {
            let times = numbers(&fixture["times"]);
            let result = calculate_chug_average(times[0], times[1]);
            if let Some(error) = fixture.get("error") {
                assert_eq!(result, Err(error.as_str().unwrap()));
            } else {
                assert_eq!(result, Ok(fixture["expected"].as_f64().unwrap()));
            }
        }
        for fixture in fixtures["ranked"].as_array().unwrap() {
            let teams: Vec<_> = numbers(&fixture["scores"])
                .into_iter()
                .enumerate()
                .map(|(i, score)| TeamScore {
                    team_id: i.to_string(),
                    score,
                })
                .collect();
            let actual: Vec<_> = calculate_points_with_tiebreaking(&teams)
                .into_iter()
                .map(|p| p.points)
                .collect();
            assert_eq!(actual, numbers(&fixture["points"]));
        }
        for fixture in fixtures["events"].as_array().unwrap() {
            let input: HashMap<_, _> = numbers(&fixture["scores"])
                .into_iter()
                .enumerate()
                .map(|(i, score)| (i.to_string(), score))
                .collect();
            for (actual, key) in [
                (rank_fish_teams(&input), "fish"),
                (rank_chug_teams(&input), "chug"),
                (rank_golf_teams(&input), "golf"),
            ] {
                let expected = numbers(&fixture[key]);
                let actual: Vec<_> = (0..expected.len())
                    .map(|i| actual[&i.to_string()])
                    .collect();
                assert_eq!(actual, expected);
            }
        }
    }
}
